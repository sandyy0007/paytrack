/**
 * Local repository. Every mutation runs in one SQLite transaction that writes
 * the record, its timeline event and an outbox operation for sync — so an
 * expense is never lost, even if the app is killed right after.
 */
import {
  applyTransition, classifyReference, DEFAULT_CATEGORIES, matchesQuery, needsAttention, statusBucket,
  type Budget, type BudgetPeriod, type Category, type Expense, type ExpenseEvent, type ExpenseStatus,
  type PaymentMethod, type QrSource,
} from '@paytrack/shared';
import { bumpData } from './dataVersion';
import { getDb, inTx, type Tx } from './db';
import { nextExpenseCode, uuid } from './ids';

/* ------------------------------- mapping ------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface LocalExpense extends Expense {
  syncState: 'pending' | 'synced' | 'error';
  syncError: string | null;
}

export function rowToExpense(r: Row): LocalExpense {
  return {
    id: r.id, expenseCode: r.expense_code, userId: r.user_id, amountPaise: r.amount_paise, currency: 'INR',
    payeeName: r.payee_name, upiId: r.upi_id, reason: r.reason, category: r.category, status: r.status,
    paymentMethod: r.payment_method, utr: r.utr, transactionReference: r.transaction_reference, paymentApp: r.payment_app,
    qrSource: r.qr_source, qrPayload: r.qr_payload, notes: r.notes, createdAt: r.created_at, expenseDate: r.expense_date,
    paymentInitiatedAt: r.payment_initiated_at, paymentCompletedAt: r.payment_completed_at, updatedAt: r.updated_at,
    deletedAt: r.deleted_at, syncState: r.sync_state, syncError: r.sync_error,
  };
}

function rowToEvent(r: Row): ExpenseEvent {
  return { id: r.id, expenseId: r.expense_id, fromStatus: r.from_status, toStatus: r.to_status, at: r.at, meta: r.meta ? JSON.parse(r.meta) : undefined };
}

async function enqueue(tx: Tx, type: string, entityId: string, payload: unknown) {
  await tx.runAsync(
    'INSERT INTO outbox (op_id, type, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    uuid(), type, entityId, JSON.stringify(payload), new Date().toISOString(),
  );
}

async function insertEvent(tx: Tx, ev: ExpenseEvent) {
  await tx.runAsync(
    'INSERT OR IGNORE INTO expense_events (id, expense_id, from_status, to_status, at, meta) VALUES (?, ?, ?, ?, ?, ?)',
    ev.id, ev.expenseId, ev.fromStatus, ev.toStatus, ev.at, ev.meta ? JSON.stringify(ev.meta) : null,
  );
}

export class LocalDuplicateReferenceError extends Error {
  constructor() {
    super('Transaction ID already exists.');
    this.name = 'LocalDuplicateReferenceError';
  }
}

/* ------------------------------- expenses ------------------------------ */

export interface NewExpenseInput {
  amountPaise: number;
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  paymentMethod: PaymentMethod;
  qrSource: QrSource;
  qrParams: Record<string, string> | null;
  notes?: string | null;
  expenseDate?: string;
}

/**
 * Creates the expense (DRAFT) and immediately moves it along:
 *  - UPI: DRAFT → PENDING_PAYMENT (the payment slip)
 *  - manual (cash etc.): DRAFT → PAID
 */
export async function createExpense(input: NewExpenseInput): Promise<LocalExpense> {
  const db = await getDb();
  const now = new Date();
  const at = now.toISOString();
  const code = await nextExpenseCode(now);
  const id = uuid();
  const base: LocalExpense = {
    id, expenseCode: code, userId: null, amountPaise: input.amountPaise, currency: 'INR',
    payeeName: input.payeeName, upiId: input.upiId, reason: input.reason.trim(), category: input.category,
    status: 'DRAFT', paymentMethod: input.paymentMethod, utr: null, transactionReference: null, paymentApp: null,
    qrSource: input.qrSource, qrPayload: input.qrParams ? JSON.stringify(input.qrParams) : null, notes: input.notes ?? null,
    createdAt: at, expenseDate: input.expenseDate ?? at, paymentInitiatedAt: null, paymentCompletedAt: null,
    updatedAt: at, deletedAt: null, syncState: 'pending', syncError: null,
  };
  const nextStatus: ExpenseStatus = input.paymentMethod === 'UPI' ? 'PENDING_PAYMENT' : 'PAID';
  const { expense: moved, event } = applyTransition(base, { to: nextStatus, at, eventId: uuid() });

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO expenses (id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method,
         qr_source, qr_payload, notes, created_at, expense_date, updated_at, payment_completed_at, sync_state)
       VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      id, code, base.amountPaise, base.payeeName, base.upiId, base.reason, base.category, moved.status, base.paymentMethod,
      base.qrSource, base.qrPayload, base.notes, at, base.expenseDate, at, moved.paymentCompletedAt,
    );
    const draftEventId = uuid();
    await insertEvent(tx, { id: draftEventId, expenseId: id, fromStatus: null, toStatus: 'DRAFT', at });
    await insertEvent(tx, event);
    await enqueue(tx, 'expense.create', id, {
      id, draftEventId, expenseCode: code, amountPaise: base.amountPaise, currency: 'INR', payeeName: base.payeeName, upiId: base.upiId,
      reason: base.reason, category: base.category, paymentMethod: base.paymentMethod, qrSource: base.qrSource,
      qrPayload: input.qrParams, notes: base.notes, createdAt: at, expenseDate: base.expenseDate, updatedAt: at,
    });
    await enqueue(tx, 'expense.transition', id, { id, to: nextStatus, at, eventId: event.id });
  });
  bumpData();
  return { ...moved, syncState: 'pending', syncError: null };
}

export async function getExpense(id: string): Promise<LocalExpense | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>('SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL', id);
  return r ? rowToExpense(r) : null;
}

export async function getEvents(expenseId: string): Promise<ExpenseEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM expense_events WHERE expense_id = ? ORDER BY at, rowid', expenseId);
  return rows.map(rowToEvent);
}

export interface TransitionOptions {
  reference?: string;
  paymentApp?: string;
  meta?: ExpenseEvent['meta'];
}

/** Applies a validated state-machine transition locally and queues it for sync. */
export async function transition(id: string, to: ExpenseStatus, opts: TransitionOptions = {}): Promise<LocalExpense> {
  const db = await getDb();
  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');
  const at = new Date().toISOString();
  const eventId = uuid();
  const { expense, event } = applyTransition(current, { to, at, eventId, reference: opts.reference, paymentApp: opts.paymentApp, meta: opts.meta });

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET status = ?, utr = ?, transaction_reference = ?, payment_app = ?, payment_initiated_at = ?,
         payment_completed_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      expense.status, expense.utr, expense.transactionReference, expense.paymentApp, expense.paymentInitiatedAt,
      expense.paymentCompletedAt, at, id,
    );
    await insertEvent(tx, event);
    await enqueue(tx, 'expense.transition', id, {
      id, to, at, eventId, ...(opts.reference ? { reference: opts.reference } : {}), ...(opts.paymentApp ? { paymentApp: opts.paymentApp } : {}),
      ...(opts.meta ? { meta: opts.meta } : {}),
    });
  });
  bumpData();
  return { ...expense, syncState: 'pending', syncError: null };
}

/** Saves the UTR / transaction ID: UTR_ADDED → PAID atomically, with duplicate protection. */
export async function saveReference(id: string, reference: string): Promise<LocalExpense> {
  const r = classifyReference(reference);
  if (!r.ok) throw new Error(r.message);
  const db = await getDb();
  const dup = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM expenses WHERE deleted_at IS NULL AND id <> ? AND (utr = ? OR transaction_reference = ?)`, id, r.value, r.value,
  );
  if (dup) throw new LocalDuplicateReferenceError();

  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');
  const at = new Date().toISOString();
  const e1 = uuid();
  const step1 = applyTransition(current, { to: 'UTR_ADDED', at, eventId: e1, reference: r.value });
  const step2 = applyTransition(step1.expense, { to: 'PAID', at, eventId: uuid() });
  const final = step2.expense;

  try {
    await inTx(db, async (tx) => {
      await tx.runAsync(
        `UPDATE expenses SET status = ?, utr = ?, transaction_reference = ?, payment_completed_at = ?, updated_at = ?, sync_state = 'pending'
         WHERE id = ?`,
        final.status, final.utr, final.transactionReference, final.paymentCompletedAt, at, id,
      );
      await insertEvent(tx, step1.event);
      await insertEvent(tx, step2.event);
      await enqueue(tx, 'expense.reference', id, { id, reference: r.value, eventId: e1, at });
    });
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new LocalDuplicateReferenceError();
    throw e;
  }
  bumpData();
  return { ...final, syncState: 'pending', syncError: null };
}

export interface ExpensePatch {
  reason?: string;
  category?: string;
  notes?: string | null;
  expenseDate?: string;
}

export async function updateExpense(id: string, patch: ExpensePatch): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    const cur = await tx.getFirstAsync<Row>('SELECT * FROM expenses WHERE id = ?', id);
    if (!cur) throw new Error('Expense not found');
    await tx.runAsync(
      `UPDATE expenses SET reason = ?, category = ?, notes = ?, expense_date = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      patch.reason?.trim() ?? cur.reason, patch.category ?? cur.category,
      patch.notes !== undefined ? patch.notes : cur.notes, patch.expenseDate ?? cur.expense_date, at, id,
    );
    await enqueue(tx, 'expense.update', id, { id, patch: { ...patch, updatedAt: at } });
  });
  bumpData();
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync(`UPDATE expenses SET deleted_at = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`, at, at, id);
    await enqueue(tx, 'expense.delete', id, { id });
  });
  bumpData();
}

/* -------------------------------- queries ------------------------------- */

export type BucketFilter = 'ALL' | 'PAID' | 'PENDING' | 'FAILED' | 'UNCONFIRMED';
export type RangeFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export interface ListParams {
  bucket?: BucketFilter;
  from?: Date | null;
  to?: Date | null;
  query?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lists expenses newest first. SQL narrows by date/limit; the shared matcher
 * then applies "smart" search (amounts, month names, UTRs…).
 */
export async function listExpenses(p: ListParams = {}): Promise<LocalExpense[]> {
  const db = await getDb();
  const where = ['deleted_at IS NULL', "status <> 'DRAFT'"];
  const args: (string | number)[] = [];
  if (p.from) { where.push('expense_date >= ?'); args.push(p.from.toISOString()); }
  if (p.to) { where.push('expense_date < ?'); args.push(p.to.toISOString()); }
  const limit = p.limit ?? 50;
  const q = p.query?.trim();
  // With a search query we scan more rows and filter in JS (still bounded).
  const sqlLimit = q ? 5000 : limit + (p.offset ?? 0);
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM expenses WHERE ${where.join(' AND ')} ORDER BY expense_date DESC, rowid DESC LIMIT ?`,
    ...args, sqlLimit,
  );
  let items = rows.map(rowToExpense);
  if (p.bucket && p.bucket !== 'ALL') items = items.filter((e) => statusBucket(e.status) === p.bucket);
  if (q) items = items.filter((e) => matchesQuery(e, q));
  return items.slice(p.offset ?? 0, (p.offset ?? 0) + limit);
}

export async function listAttention(): Promise<LocalExpense[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM expenses WHERE deleted_at IS NULL AND status IN
      ('PENDING_PAYMENT','PAYMENT_APP_OPENED','USER_RETURNED','PAYMENT_CONFIRMED_BY_USER','UTR_ADDED','UNCONFIRMED')
     ORDER BY expense_date DESC LIMIT 50`,
  );
  return rows.map(rowToExpense).filter((e) => needsAttention(e.status));
}

/** All non-deleted expenses in a date window, for analytics/budgets/export. */
export async function expensesSince(from: Date | null): Promise<LocalExpense[]> {
  const db = await getDb();
  const rows = from
    ? await db.getAllAsync<Row>('SELECT * FROM expenses WHERE deleted_at IS NULL AND expense_date >= ? ORDER BY expense_date DESC', from.toISOString())
    : await db.getAllAsync<Row>('SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY expense_date DESC');
  return rows.map(rowToExpense);
}

export async function countExpenses(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM expenses WHERE deleted_at IS NULL AND status <> 'DRAFT'");
  return r?.n ?? 0;
}

/** Stuck payment sessions (e.g. app killed while in the UPI app). */
export async function findOpenPaymentSessions(): Promise<LocalExpense[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM expenses WHERE deleted_at IS NULL AND status IN ('PAYMENT_APP_OPENED','USER_RETURNED') ORDER BY updated_at DESC",
  );
  return rows.map(rowToExpense);
}

/* ------------------------------- budgets -------------------------------- */

function rowToBudget(r: Row): Budget {
  return { id: r.id, category: r.category, amountPaise: r.amount_paise, period: r.period, thresholds: JSON.parse(r.thresholds),
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at };
}

export async function listBudgets(): Promise<Budget[]> {
  const db = await getDb();
  return (await db.getAllAsync<Row>('SELECT * FROM budgets WHERE deleted_at IS NULL ORDER BY created_at')).map(rowToBudget);
}

export async function upsertBudget(b: { id?: string; category: string; amountPaise: number; period: BudgetPeriod; thresholds: number[] }): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  const id = b.id ?? uuid();
  await inTx(db, async (tx) => {
    const clash = await tx.getFirstAsync<Row>(
      'SELECT id FROM budgets WHERE deleted_at IS NULL AND category = ? AND period = ? AND id <> ?', b.category, b.period, id,
    );
    if (clash) throw new Error('A budget for this category and period already exists.');
    await tx.runAsync(
      `INSERT INTO budgets (id, category, amount_paise, period, thresholds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET category = excluded.category, amount_paise = excluded.amount_paise, period = excluded.period,
         thresholds = excluded.thresholds, updated_at = excluded.updated_at`,
      id, b.category, b.amountPaise, b.period, JSON.stringify(b.thresholds), at, at,
    );
    await enqueue(tx, 'budget.upsert', id, { id, category: b.category, amountPaise: b.amountPaise, period: b.period, thresholds: b.thresholds });
  });
  bumpData();
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?', at, at, id);
    await enqueue(tx, 'budget.delete', id, { id });
  });
  bumpData();
}

/* ------------------------------ categories ------------------------------ */

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const custom = await db.getAllAsync<Row>('SELECT * FROM categories ORDER BY created_at');
  return [
    ...DEFAULT_CATEGORIES.map((c) => ({ id: `default:${c.name}`, ...c, isDefault: true })),
    ...custom.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false })),
  ];
}

export async function addCategory(name: string, color: string): Promise<void> {
  const db = await getDb();
  const clean = name.trim();
  if (DEFAULT_CATEGORIES.some((c) => c.name.toLowerCase() === clean.toLowerCase())) throw new Error('That category already exists.');
  const id = uuid();
  try {
    await inTx(db, async (tx) => {
      await tx.runAsync('INSERT INTO categories (id, name, icon, color, created_at) VALUES (?, ?, ?, ?, ?)',
        id, clean, 'other', color, new Date().toISOString());
      await enqueue(tx, 'category.upsert', id, { id, name: clean, icon: 'other', color });
    });
  } catch {
    throw new Error('That category already exists.');
  }
  bumpData();
}
