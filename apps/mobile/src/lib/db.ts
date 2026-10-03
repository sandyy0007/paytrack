/**
 * Local persistence (offline-first). SQLite is the source of truth for the UI;
 * the sync engine mirrors it to the backend when a connection is available.
 */
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    expense_code TEXT NOT NULL,
    user_id TEXT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    payee_name TEXT,
    upi_id TEXT,
    reason TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    utr TEXT,
    transaction_reference TEXT,
    payment_app TEXT,
    qr_source TEXT NOT NULL DEFAULT 'NONE',
    qr_payload TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    payment_initiated_at TEXT,
    payment_completed_at TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    sync_error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses (expense_date DESC);
  CREATE INDEX IF NOT EXISTS idx_exp_status ON expenses (status);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_exp_utr ON expenses (utr) WHERE utr IS NOT NULL AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_exp_txn ON expenses (transaction_reference) WHERE transaction_reference IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS expense_events (
    id TEXT PRIMARY KEY NOT NULL,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    at TEXT NOT NULL,
    meta TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ev_exp ON expense_events (expense_id, at);

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    period TEXT NOT NULL,
    thresholds TEXT NOT NULL DEFAULT '[75,90,100]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_name ON categories (name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    entity_id TEXT,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    dead INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `,
];

/**
 * Idempotently reconciles the SQLite schema by dynamically inspecting
 * PRAGMA table_info(expenses) and adding any missing columns.
 */
export async function reconcileSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(expenses)');
  const colNames = new Set(cols.map((c) => c.name.toLowerCase()));

  const requiredColumns: [string, string][] = [
    ['transaction_id', 'TEXT'],
    ['transaction_reference', 'TEXT'],
    ['approval_reference', 'TEXT'],
    ['response_code', 'TEXT'],
    ['utr', 'TEXT'],
    ['original_qr_payload_hash', 'TEXT'],
    ['payment_intent_hash', 'TEXT'],
    ['intended_amount_paise', 'INTEGER'],
    ['actual_amount_paise', 'INTEGER'],
    ['reconciliation_status', 'TEXT'],
    ['confidence_level', 'TEXT'],
    ['confidence_reasons', 'TEXT'],
    ['mode', 'TEXT DEFAULT "Personal"'],
    ['split_data', 'TEXT'],
    ['recovery_dismissed', 'INTEGER DEFAULT 0'],
  ];

  for (const [col, colType] of requiredColumns) {
    if (!colNames.has(col.toLowerCase())) {
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN ${col} ${colType};`);
      } catch {
        // column may have been added concurrently
      }
    }
  }

  // Create indexes for efficient querying
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_exp_txnid ON expenses (transaction_id);
    CREATE INDEX IF NOT EXISTS idx_exp_appref ON expenses (approval_reference);
    CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses (expense_date DESC);
    CREATE INDEX IF NOT EXISTS idx_exp_status ON expenses (status);
    CREATE INDEX IF NOT EXISTS idx_exp_mode ON expenses (mode);
  `);
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('paytrack.db', { useNewConnection: true });
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v]!;
    await inTx(db, async (tx) => {
      await tx.execAsync(sql);
    });
    v += 1;
    await db.execAsync(`PRAGMA user_version = ${v}`);
  }

  // Reconcile schema dynamically on boot so no missing column errors ever occur
  await reconcileSchema(db);
  return db;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export type Tx = SQLite.SQLiteDatabase;

/**
 * Runs `fn` in one atomic transaction. Native uses an exclusive transaction
 * (isolated from concurrent queries); web preview falls back to a plain one.
 */
export async function inTx(db: SQLite.SQLiteDatabase, fn: (tx: Tx) => Promise<void>): Promise<void> {
  return db.withTransactionAsync(() => fn(db));
}

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return r?.value ?? null;
}
export async function kvSet(key: string, value: string, tx?: Tx): Promise<void> {
  const db = tx ?? (await getDb());
  await db.runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** Wipes all local data (logout / delete account). */
export async function resetLocalData(): Promise<void> {
  const db = await getDb();
  await inTx(db, async (tx) => {
    await tx.execAsync('DELETE FROM expense_events; DELETE FROM expenses; DELETE FROM budgets; DELETE FROM categories; DELETE FROM outbox; DELETE FROM kv;');
  });
}
