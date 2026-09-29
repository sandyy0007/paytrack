/**
 * Offline-first sync engine.
 *  push: outbox ops in order → POST /sync/push (idempotent, safe to retry)
 *  pull: GET /sync/pull?since=cursor → merge (local pending changes win)
 */
import * as Network from 'expo-network';
import { create } from 'zustand';
import { api, ApiError } from './api';
import { bumpData } from './dataVersion';
import { getDb, inTx, kvGet, kvSet } from './db';
import { useSession } from './session';

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'local';

export const useSyncState = create<{ status: SyncStatus; pending: number; lastSyncedAt: string | null; message: string | null }>(() => ({
  status: 'idle', pending: 0, lastSyncedAt: null, message: null,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
let running: Promise<void> | null = null;
let queued = false;

export async function refreshPendingCount() {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM outbox WHERE dead = 0');
  useSyncState.setState({ pending: r?.n ?? 0 });
}

export function syncNow(): Promise<void> {
  if (running) {
    queued = true;
    return running;
  }
  running = run()
    .catch(() => undefined)
    .finally(() => {
      running = null;
      if (queued) {
        queued = false;
        void syncNow();
      }
    });
  return running;
}

let debounce: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(ms = 800) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), ms);
}

async function run() {
  await refreshPendingCount();
  const s = useSession.getState();
  if (s.session?.mode !== 'remote' || s.expired) {
    useSyncState.setState({ status: 'local', message: 'Saved on this device.' });
    return;
  }
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net && (net.isConnected === false || net.isInternetReachable === false)) {
    useSyncState.setState({ status: 'offline', message: 'Saved locally. Syncing when connection is available.' });
    return;
  }
  useSyncState.setState({ status: 'syncing', message: null });
  try {
    await push();
    await pull();
    useSyncState.setState({ status: 'idle', lastSyncedAt: new Date().toISOString(), message: null });
  } catch (e) {
    const offline = e instanceof ApiError && e.isNetwork;
    useSyncState.setState({
      status: offline ? 'offline' : 'error',
      message: offline ? 'Saved locally. Syncing when connection is available.' : "Couldn't sync right now. We'll retry automatically.",
    });
  } finally {
    await refreshPendingCount();
  }
}

async function push() {
  const db = await getDb();
  for (let guard = 0; guard < 50; guard++) {
    const rows = await db.getAllAsync<Row>('SELECT * FROM outbox WHERE dead = 0 ORDER BY seq LIMIT 50');
    if (!rows.length) return;
    const ops = rows.map((r) => ({ opId: r.op_id, type: r.type, payload: JSON.parse(r.payload) }));
    const res = await api<{ results: { opId: string; ok: boolean; code?: string; message?: string; retryable?: boolean }[] }>(
      '/sync/push', { method: 'POST', body: { ops }, timeoutMs: 30_000 },
    );
    const byId = new Map(res.results.map((r) => [r.opId, r]));
    let progressed = false;
    await inTx(db, async (tx) => {
      for (const row of rows) {
        const r = byId.get(row.op_id);
        if (!r) continue;
        if (r.ok) {
          await tx.runAsync('DELETE FROM outbox WHERE seq = ?', row.seq);
          progressed = true;
        } else if (r.retryable) {
          await tx.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?', r.message ?? null, row.seq);
        } else {
          // Permanent rejection: keep the local record, flag it for the user.
          await tx.runAsync('UPDATE outbox SET dead = 1, last_error = ? WHERE seq = ?', r.message ?? r.code ?? null, row.seq);
          if (row.entity_id && row.type.startsWith('expense.')) {
            await tx.runAsync("UPDATE expenses SET sync_state = 'error', sync_error = ? WHERE id = ?", r.message ?? 'Sync failed', row.entity_id);
          }
          progressed = true;
        }
      }
      // Mark expenses with no remaining ops as synced.
      await tx.runAsync(
        `UPDATE expenses SET sync_state = 'synced', sync_error = NULL
          WHERE sync_state = 'pending' AND id NOT IN (SELECT entity_id FROM outbox WHERE entity_id IS NOT NULL)`,
      );
    });
    bumpData();
    if (!progressed) return; // only retryable failures left; try later
  }
}

async function pull() {
  const db = await getDb();
  for (let guard = 0; guard < 20; guard++) {
    const since = await kvGet('sync.cursor');
    const res = await api<{ expenses: Row[]; events: Row[]; budgets: Row[]; categories?: Row[]; cursor: string; hasMore: boolean }>(
      `/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`, { timeoutMs: 30_000 },
    );
    await inTx(db, async (tx) => {
      const pendingIds = new Set(
        (await tx.getAllAsync<{ entity_id: string }>('SELECT DISTINCT entity_id FROM outbox WHERE entity_id IS NOT NULL')).map((r) => r.entity_id),
      );
      for (const e of res.expenses) {
        if (pendingIds.has(e.id)) continue; // local changes not yet pushed win
        await tx.runAsync(
          `INSERT INTO expenses (id, expense_code, user_id, amount_paise, currency, payee_name, upi_id, reason, category, status,
             payment_method, utr, transaction_reference, payment_app, qr_source, qr_payload, notes, created_at, expense_date,
             payment_initiated_at, payment_completed_at, updated_at, deleted_at, sync_state, sync_error)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'synced',NULL)
           ON CONFLICT(id) DO UPDATE SET expense_code=excluded.expense_code, user_id=excluded.user_id, amount_paise=excluded.amount_paise,
             payee_name=excluded.payee_name, upi_id=excluded.upi_id, reason=excluded.reason, category=excluded.category,
             status=excluded.status, payment_method=excluded.payment_method, utr=excluded.utr,
             transaction_reference=excluded.transaction_reference, payment_app=excluded.payment_app, qr_source=excluded.qr_source,
             qr_payload=excluded.qr_payload, notes=excluded.notes, expense_date=excluded.expense_date,
             payment_initiated_at=excluded.payment_initiated_at, payment_completed_at=excluded.payment_completed_at,
             updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, sync_state='synced', sync_error=NULL`,
          e.id, e.expenseCode, e.userId, e.amountPaise, 'INR', e.payeeName, e.upiId, e.reason, e.category, e.status,
          e.paymentMethod, e.utr, e.transactionReference, e.paymentApp, e.qrSource, e.qrPayload, e.notes, e.createdAt,
          e.expenseDate, e.paymentInitiatedAt, e.paymentCompletedAt, e.updatedAt, e.deletedAt,
        );
      }
      for (const ev of res.events) {
        if (pendingIds.has(ev.expenseId)) continue;
        await tx.runAsync(
          'INSERT OR IGNORE INTO expense_events (id, expense_id, from_status, to_status, at, meta) VALUES (?,?,?,?,?,?)',
          ev.id, ev.expenseId, ev.fromStatus, ev.toStatus, ev.at, ev.meta ? JSON.stringify(ev.meta) : null,
        );
      }
      for (const b of res.budgets) {
        if (pendingIds.has(b.id)) continue;
        await tx.runAsync(
          `INSERT INTO budgets (id, category, amount_paise, period, thresholds, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET category=excluded.category, amount_paise=excluded.amount_paise, period=excluded.period,
             thresholds=excluded.thresholds, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
          b.id, b.category, b.amountPaise, b.period, JSON.stringify(b.thresholds), b.createdAt, b.updatedAt, b.deletedAt,
        );
      }
      for (const c of res.categories ?? []) {
        if (c.deleted) await tx.runAsync('DELETE FROM categories WHERE id = ?', c.id);
        else await tx.runAsync('INSERT OR IGNORE INTO categories (id, name, icon, color, created_at) VALUES (?,?,?,?,?)', c.id, c.name, c.icon, c.color, new Date().toISOString());
      }
      await kvSet('sync.cursor', res.cursor, tx);
    });
    bumpData();
    if (!res.hasMore) return;
  }
}

/** Starts listeners: network regained → sync. Returns an unsubscribe. */
export function startSyncListeners(): () => void {
  const sub = Network.addNetworkStateListener((st) => {
    if (st.isConnected && st.isInternetReachable !== false) scheduleSync(300);
  });
  return () => sub.remove();
}
