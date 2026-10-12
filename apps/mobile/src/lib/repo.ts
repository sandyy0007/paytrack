/**
 * Local repository. Every mutation runs in one SQLite transaction that writes
 * the record, its timeline event and an outbox operation for sync — so an
 * expense is never lost, even if the app is killed right after.
 */
import {
  applyTransition, calculateExpenseConfidence, classifyReference, DEFAULT_CATEGORIES, matchesQuery, needsAttention, statusBucket,
  type Budget, type BudgetPeriod, type Category, type Expense, type ExpenseEvent, type ExpenseMode,
  type ExpenseStatus, type FinancialTransactionType, type Goal, type Loan, type PaymentMethod, type QrSource,
  type ReconciliationStatus, type SplitData, type Subscription, type PaymentConfirmationSource,
} from '@paytrack/shared';
import { bumpData } from './dataVersion';
import { getDb, inTx, kvGet, kvSet, type Tx } from './db';
import { nextExpenseCode, uuid } from './ids';

/* ------------------------------- mapping ------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface LocalExpense extends Expense {
  syncState: 'pending' | 'synced' | 'error';
  syncError: string | null;
  rawQrPayload?: string | null;
}

export function rowToExpense(r: Row): LocalExpense {
  let rawQrPayload: string | null = null;
  if (r.qr_payload) {
    const trimmed = typeof r.qr_payload === 'string' ? r.qr_payload.trim() : '';
    if (trimmed.toLowerCase().startsWith('upi:')) {
      rawQrPayload = trimmed;
    } else {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof parsed.raw === 'string' && parsed.raw.trim().toLowerCase().startsWith('upi:')) {
          rawQrPayload = parsed.raw.trim();
        }
      } catch {}
    }
  }

  return {
    id: r.id, expenseCode: r.expense_code, userId: r.user_id, amountPaise: r.amount_paise, currency: 'INR',
    payeeName: r.payee_name, upiId: r.upi_id, reason: r.reason, category: r.category, status: r.status,
    paymentMethod: r.payment_method, utr: r.utr, transactionReference: r.transaction_reference, paymentApp: r.payment_app,
    qrSource: r.qr_source, qrPayload: r.qr_payload, notes: r.notes, createdAt: r.created_at, expenseDate: r.expense_date,
    paymentInitiatedAt: r.payment_initiated_at, paymentCompletedAt: r.payment_completed_at, updatedAt: r.updated_at,
    deletedAt: r.deleted_at, syncState: r.sync_state, syncError: r.sync_error,
    rawQrPayload,
    transactionId: r.transaction_id ?? null,
    approvalReference: r.approval_reference ?? null,
    responseCode: r.response_code ?? null,
    originalQrPayloadHash: r.original_qr_payload_hash ?? null,
    paymentIntentHash: r.payment_intent_hash ?? null,
    intendedAmountPaise: r.intended_amount_paise ?? null,
    actualAmountPaise: r.actual_amount_paise ?? null,
    reconciliationStatus: r.reconciliation_status ?? null,
    confidenceLevel: r.confidence_level ?? null,
    confidenceReasons: r.confidence_reasons ? (typeof r.confidence_reasons === 'string' ? JSON.parse(r.confidence_reasons) : r.confidence_reasons) : null,
    mode: (r.mode as ExpenseMode) ?? 'Personal',
    splitData: r.split_data ? (typeof r.split_data === 'string' ? JSON.parse(r.split_data) : r.split_data) : null,
    recoveryDismissed: r.recovery_dismissed === 1 || r.recovery_dismissed === true,
    financialType: (r.financial_type as FinancialTransactionType) ?? 'EXPENSE',
    paymentConfirmationSource: (r.payment_confirmation_source as PaymentConfirmationSource) ?? null,
    tags: r.tags ? (typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags) : null,
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
  reason?: string | null;
  category: string;
  paymentMethod: PaymentMethod;
  qrSource: QrSource;
  qrParams: Record<string, string> | null;
  originalQrPayload?: string | null;
  notes?: string | null;
  expenseDate?: string;
  mode?: ExpenseMode | null;
  financialType?: FinancialTransactionType;
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
  const baseMode = input.mode ?? 'Personal';
  const finType = input.financialType ?? 'EXPENSE';
  const rawQrPayload = input.originalQrPayload ?? null;
  const qrPayloadStr = rawQrPayload
    ? JSON.stringify({ raw: rawQrPayload, params: input.qrParams ?? {} })
    : input.qrParams ? JSON.stringify(input.qrParams) : null;

  const base: LocalExpense = {
    id, expenseCode: code, userId: null, amountPaise: input.amountPaise, currency: 'INR',
    payeeName: input.payeeName, upiId: input.upiId, reason: (input.reason ?? '').trim(), category: input.category,
    status: 'DRAFT', paymentMethod: input.paymentMethod, utr: null, transactionReference: null, paymentApp: null,
    qrSource: input.qrSource, qrPayload: qrPayloadStr, notes: input.notes ?? null,
    createdAt: at, expenseDate: input.expenseDate ?? at, paymentInitiatedAt: null, paymentCompletedAt: null,
    updatedAt: at, deletedAt: null, syncState: 'pending', syncError: null,
    mode: baseMode,
    intendedAmountPaise: input.amountPaise,
    financialType: finType,
    rawQrPayload,
  };
  const nextStatus: ExpenseStatus = input.paymentMethod === 'UPI' ? 'PENDING_PAYMENT' : 'PAID';
  const { expense: moved, event } = applyTransition(base, { to: nextStatus, at, eventId: uuid() });

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO expenses (id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method,
         qr_source, qr_payload, notes, created_at, expense_date, updated_at, payment_completed_at, sync_state, mode, intended_amount_paise, financial_type)
       VALUES (?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id, code, base.amountPaise, base.payeeName, base.upiId, base.reason, base.category, moved.status, base.paymentMethod,
      base.qrSource, base.qrPayload, base.notes, at, base.expenseDate, at, moved.paymentCompletedAt, baseMode, input.amountPaise, finType,
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
  transactionId?: string | null;
  approvalReference?: string | null;
  responseCode?: string | null;
}

/** Applies a validated state-machine transition locally and queues it for sync. */
export async function transition(id: string, to: ExpenseStatus, opts: TransitionOptions = {}): Promise<LocalExpense> {
  const db = await getDb();
  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');
  const at = new Date().toISOString();
  const eventId = uuid();
  const { expense, event } = applyTransition(current, {
    to,
    at,
    eventId,
    reference: opts.reference,
    paymentApp: opts.paymentApp,
    meta: opts.meta,
    transactionId: opts.transactionId ?? null,
    approvalReference: opts.approvalReference ?? null,
    responseCode: opts.responseCode ?? null,
  });

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET status = ?, utr = ?, transaction_reference = ?, payment_app = ?, payment_initiated_at = ?,
         payment_completed_at = ?, updated_at = ?, transaction_id = ?, approval_reference = ?, response_code = ?, sync_state = 'pending' WHERE id = ?`,
      expense.status, expense.utr, expense.transactionReference, expense.paymentApp, expense.paymentInitiatedAt,
      expense.paymentCompletedAt, at, expense.transactionId ?? null, expense.approvalReference ?? null, expense.responseCode ?? null, id,
    );
    await insertEvent(tx, event);
    await enqueue(tx, 'expense.transition', id, {
      id, to, at, eventId,
      ...(opts.reference ? { reference: opts.reference } : {}),
      ...(opts.paymentApp ? { paymentApp: opts.paymentApp } : {}),
      ...(opts.meta ? { meta: opts.meta } : {}),
      ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
      ...(opts.approvalReference ? { approvalReference: opts.approvalReference } : {}),
      ...(opts.responseCode ? { responseCode: opts.responseCode } : {}),
    });
  });
  bumpData();
  return { ...expense, syncState: 'pending', syncError: null };
}

/** Auto-saves a successful UPI response: SUCCESS_RESPONSE → PAID with zero manual typing required. */
export async function saveSuccessfulPayment(
  id: string,
  response: {
    status: string;
    txnId?: string;
    txnRef?: string;
    approvalRefNo?: string;
    responseCode?: string;
    utr?: string;
  } | null,
  paymentApp?: string,
): Promise<LocalExpense> {
  const db = await getDb();
  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');
  if (current.status === 'PAID') return current;

  const at = new Date().toISOString();
  const transactionId = response?.txnId ?? null;
  const approvalReference = response?.approvalRefNo ?? null;
  const responseCode = response?.responseCode ?? '00';

  // Strict UTR separation: ONLY 12-digit numeric bank reference is a UTR
  let utr: string | null = null;
  let transactionReference: string | null = null;

  if (response?.utr && /^[0-9]{12}$/.test(response.utr)) {
    utr = response.utr;
  } else if (approvalReference && /^[0-9]{12}$/.test(approvalReference)) {
    utr = approvalReference;
  }

  if (response?.txnRef) {
    transactionReference = response.txnRef;
  } else if (approvalReference && !utr) {
    transactionReference = approvalReference;
  } else if (transactionId) {
    transactionReference = transactionId;
  }

  // Reconciliation status & confidence
  let recStatus: ReconciliationStatus = 'CONFIRMED_UNRECONCILED';
  let confSource: PaymentConfirmationSource = 'USER_CONFIRMED';

  if (utr) {
    recStatus = 'RECONCILED';
    confSource = 'AUTO_UPI';
  } else if (transactionId || transactionReference || approvalReference) {
    recStatus = 'RESPONSE_RECEIVED';
    confSource = 'AUTO_UPI';
  }

  const conf = calculateExpenseConfidence({
    status: 'PAID',
    utr,
    approvalReference,
    transactionId,
    transactionReference,
    responseCode,
    reconciliationStatus: recStatus,
    paymentMethod: current.paymentMethod,
    paymentConfirmationSource: confSource,
  });

  // 1. Step to SUCCESS_RESPONSE if not already there
  let currentStep: LocalExpense | Expense = current;
  let step1Event: ExpenseEvent | null = null;
  if (current.status !== 'SUCCESS_RESPONSE') {
    const e1 = uuid();
    const s1 = applyTransition(currentStep, {
      to: 'SUCCESS_RESPONSE',
      at,
      eventId: e1,
      paymentApp,
      transactionId,
      approvalReference,
      responseCode,
      meta: { appStatus: response?.status ?? 'SUCCESS', responseCode },
    });
    currentStep = s1.expense;
    step1Event = s1.event;
  }

  // 2. Step to PAID
  const e2 = uuid();
  const s2 = applyTransition(currentStep, {
    to: 'PAID',
    at,
    eventId: e2,
    reference: utr ?? transactionReference ?? undefined,
    paymentApp,
    transactionId,
    approvalReference,
    responseCode,
  });
  const final = s2.expense;

  // Auto-create loan if this was a LENT payment
  if (current.financialType === 'LENT') {
    const existingLoan = await db.getFirstAsync<{ id: string }>('SELECT id FROM loans WHERE created_from_payment_id = ?', id);
    if (!existingLoan) {
      const loanId = uuid();
      await db.runAsync(
        `INSERT INTO loans (id, person_name, direction, original_amount_paise, repaid_amount_paise, remaining_amount_paise, status, created_at, updated_at, notes, linked_transaction_id, created_from_payment_id)
         VALUES (?, ?, 'LENT', ?, 0, ?, 'OPEN', ?, ?, ?, ?, ?)`,
        loanId, current.payeeName ?? current.upiId ?? 'Borrower', current.amountPaise, current.amountPaise, at, at, current.reason, id, id,
      );
    }
  }

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET status = ?, utr = ?, transaction_reference = ?, payment_app = ?,
         payment_initiated_at = COALESCE(payment_initiated_at, ?), payment_completed_at = ?,
         updated_at = ?, transaction_id = ?, approval_reference = ?, response_code = ?,
         reconciliation_status = ?, confidence_level = ?, confidence_reasons = ?,
         payment_confirmation_source = ?,
         sync_state = 'pending' WHERE id = ?`,
      final.status, utr, transactionReference, final.paymentApp ?? paymentApp ?? null,
      at, final.paymentCompletedAt ?? at, at,
      transactionId, approvalReference, responseCode,
      recStatus, conf.level, JSON.stringify(conf.reasons), confSource, id,
    );
    if (step1Event) await insertEvent(tx, step1Event);
    await insertEvent(tx, s2.event);

    if (step1Event) {
      await enqueue(tx, 'expense.transition', id, {
        id, to: 'SUCCESS_RESPONSE', at, eventId: step1Event.id,
        ...(paymentApp ? { paymentApp } : {}),
        ...(transactionId ? { transactionId } : {}),
        ...(approvalReference ? { approvalReference } : {}),
        ...(responseCode ? { responseCode } : {}),
      });
    }
    await enqueue(tx, 'expense.transition', id, {
      id, to: 'PAID', at, eventId: e2,
      reference: utr ?? transactionReference ?? undefined,
      ...(paymentApp ? { paymentApp } : {}),
      ...(transactionId ? { transactionId } : {}),
      ...(approvalReference ? { approvalReference } : {}),
      ...(responseCode ? { responseCode } : {}),
    });
  });

  bumpData();
  return { ...final, syncState: 'pending', syncError: null };
}

/** Records a failed payment response from UPI app: FAILED_RESPONSE → FAILED. */
export async function recordFailedPayment(
  id: string,
  response: {
    status: string;
    txnId?: string;
    txnRef?: string;
    approvalRefNo?: string;
    responseCode?: string;
  } | null,
  paymentApp?: string,
): Promise<LocalExpense> {
  const db = await getDb();
  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');

  const at = new Date().toISOString();
  const transactionId = response?.txnId ?? null;
  const approvalReference = response?.approvalRefNo ?? null;
  const responseCode = response?.responseCode ?? null;

  let currentStep: LocalExpense | Expense = current;
  let step1Event: ExpenseEvent | null = null;
  if (current.status !== 'FAILED_RESPONSE') {
    const e1 = uuid();
    const s1 = applyTransition(currentStep, {
      to: 'FAILED_RESPONSE',
      at,
      eventId: e1,
      paymentApp,
      transactionId,
      approvalReference,
      responseCode,
      meta: { appStatus: response?.status ?? 'FAILURE', responseCode },
    });
    currentStep = s1.expense;
    step1Event = s1.event;
  }

  const e2 = uuid();
  const s2 = applyTransition(currentStep, {
    to: 'FAILED',
    at,
    eventId: e2,
    paymentApp,
    transactionId,
    approvalReference,
    responseCode,
  });
  const final = s2.expense;

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET status = ?, payment_app = ?, updated_at = ?,
         transaction_id = ?, approval_reference = ?, response_code = ?, sync_state = 'pending' WHERE id = ?`,
      final.status, final.paymentApp ?? paymentApp ?? null, at,
      final.transactionId ?? null, final.approvalReference ?? null, final.responseCode ?? null, id,
    );
    if (step1Event) await insertEvent(tx, step1Event);
    await insertEvent(tx, s2.event);

    if (step1Event) {
      await enqueue(tx, 'expense.transition', id, {
        id, to: 'FAILED_RESPONSE', at, eventId: step1Event.id,
        ...(paymentApp ? { paymentApp } : {}),
        ...(transactionId ? { transactionId } : {}),
        ...(approvalReference ? { approvalReference } : {}),
        ...(responseCode ? { responseCode } : {}),
      });
    }
    await enqueue(tx, 'expense.transition', id, {
      id, to: 'FAILED', at, eventId: e2,
      ...(paymentApp ? { paymentApp } : {}),
      ...(transactionId ? { transactionId } : {}),
      ...(approvalReference ? { approvalReference } : {}),
      ...(responseCode ? { responseCode } : {}),
    });
  });

  bumpData();
  return { ...final, syncState: 'pending', syncError: null };
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
  mode?: ExpenseMode | null;
  splitData?: SplitData | null;
  financialType?: FinancialTransactionType;
}

export async function updateExpense(id: string, patch: ExpensePatch): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    const cur = await tx.getFirstAsync<Row>('SELECT * FROM expenses WHERE id = ?', id);
    if (!cur) throw new Error('Expense not found');
    await tx.runAsync(
      `UPDATE expenses SET reason = ?, category = ?, notes = ?, expense_date = ?, mode = ?, split_data = ?, financial_type = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      patch.reason !== undefined ? patch.reason.trim() : cur.reason,
      patch.category ?? cur.category,
      patch.notes !== undefined ? patch.notes : cur.notes,
      patch.expenseDate ?? cur.expense_date,
      patch.mode !== undefined ? patch.mode : cur.mode,
      patch.splitData !== undefined ? (patch.splitData ? JSON.stringify(patch.splitData) : null) : cur.split_data,
      patch.financialType !== undefined ? patch.financialType : (cur.financial_type ?? 'EXPENSE'),
      at, id,
    );
    await enqueue(tx, 'expense.update', id, { id, patch: { ...patch, updatedAt: at } });
  });
  bumpData();
}

export async function setExpenseFinancialType(id: string, financialType: FinancialTransactionType): Promise<void> {
  await updateExpense(id, { financialType });
}

export async function setExpenseMode(id: string, mode: ExpenseMode): Promise<void> {
  await updateExpense(id, { mode });
}

export async function setExpenseSplit(id: string, splitData: SplitData | null): Promise<void> {
  await updateExpense(id, { splitData });
}

export async function dismissRecovery(id: string): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync(`UPDATE expenses SET recovery_dismissed = 1, updated_at = ? WHERE id = ?`, at, id);
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
    "SELECT * FROM expenses WHERE deleted_at IS NULL AND (recovery_dismissed IS NULL OR recovery_dismissed = 0) AND status IN ('PAYMENT_APP_OPENED','USER_RETURNED') ORDER BY updated_at DESC",
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

export async function getBudget(id: string): Promise<Budget | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM budgets WHERE id = ? AND deleted_at IS NULL', id);
  return row ? rowToBudget(row) : null;
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

/* --------------------------------- Udhaar --------------------------------- */

export async function listLoans(direction?: 'LENT' | 'BORROWED'): Promise<Loan[]> {
  const db = await getDb();
  const query = direction
    ? 'SELECT * FROM loans WHERE direction = ? ORDER BY created_at DESC'
    : 'SELECT * FROM loans ORDER BY created_at DESC';
  const rows = direction ? await db.getAllAsync<Row>(query, direction) : await db.getAllAsync<Row>(query);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    personName: r.person_name,
    personContact: r.person_contact,
    direction: r.direction as 'LENT' | 'BORROWED',
    originalAmountPaise: r.original_amount_paise,
    repaidAmountPaise: r.repaid_amount_paise,
    remainingAmountPaise: r.remaining_amount_paise,
    status: r.status as 'OPEN' | 'PARTIALLY_REPAID' | 'SETTLED' | 'CANCELLED',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dueDate: r.due_date,
    notes: r.notes,
    linkedTransactionId: r.linked_transaction_id,
    createdFromPaymentId: r.created_from_payment_id,
  }));
}

export async function getLoan(id: string): Promise<Loan | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>('SELECT * FROM loans WHERE id = ?', id);
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    personName: r.person_name,
    personContact: r.person_contact,
    direction: r.direction as 'LENT' | 'BORROWED',
    originalAmountPaise: r.original_amount_paise,
    repaidAmountPaise: r.repaid_amount_paise,
    remainingAmountPaise: r.remaining_amount_paise,
    status: r.status as 'OPEN' | 'PARTIALLY_REPAID' | 'SETTLED' | 'CANCELLED',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dueDate: r.due_date,
    notes: r.notes,
    linkedTransactionId: r.linked_transaction_id,
    createdFromPaymentId: r.created_from_payment_id,
  };
}

export async function createLoan(input: {
  personName: string;
  direction: 'LENT' | 'BORROWED';
  amountPaise?: number;
  originalAmountPaise?: number;
  dueDate?: string | null;
  notes?: string | null;
  personContact?: string | null;
  linkedTransactionId?: string | null;
}): Promise<Loan> {
  const db = await getDb();
  const id = uuid();
  const at = new Date().toISOString();
  const amount = input.amountPaise ?? input.originalAmountPaise ?? 0;
  await db.runAsync(
    `INSERT INTO loans (id, person_name, person_contact, direction, original_amount_paise, repaid_amount_paise, remaining_amount_paise, status, created_at, updated_at, due_date, notes, linked_transaction_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'OPEN', ?, ?, ?, ?, ?)`,
    id, input.personName.trim(), input.personContact ?? null, input.direction, amount, amount, at, at, input.dueDate ?? null, input.notes ?? null, input.linkedTransactionId ?? null,
  );
  bumpData();
  const created = await getLoan(id);
  return created!;
}

export async function recordLoanRepayment(loanId: string, repayAmountPaise: number, notes?: string): Promise<Loan> {
  const db = await getDb();
  const loan = await getLoan(loanId);
  if (!loan) throw new Error('Loan not found');
  const at = new Date().toISOString();
  const newRepaid = Math.min(loan.originalAmountPaise, loan.repaidAmountPaise + repayAmountPaise);
  const newRemaining = Math.max(0, loan.originalAmountPaise - newRepaid);
  const newStatus = newRemaining === 0 ? 'SETTLED' : 'PARTIALLY_REPAID';
  const updatedNotes = notes ? (loan.notes ? `${loan.notes}\n${notes}` : notes) : loan.notes;

  await db.runAsync(
    `UPDATE loans SET repaid_amount_paise = ?, remaining_amount_paise = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`,
    newRepaid, newRemaining, newStatus, updatedNotes ?? null, at, loanId,
  );
  bumpData();
  return (await getLoan(loanId))!;
}

export async function settleLoan(loanId: string): Promise<Loan> {
  const db = await getDb();
  const loan = await getLoan(loanId);
  if (!loan) throw new Error('Loan not found');
  const at = new Date().toISOString();
  await db.runAsync(
    `UPDATE loans SET repaid_amount_paise = original_amount_paise, remaining_amount_paise = 0, status = 'SETTLED', updated_at = ? WHERE id = ?`,
    at, loanId,
  );
  bumpData();
  return (await getLoan(loanId))!;
}

export async function deleteLoan(loanId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM loans WHERE id = ?', loanId);
  bumpData();
}

export async function getUdhaarSummary(): Promise<{
  totalLentPendingPaise: number;
  totalBorrowedPendingPaise: number;
  totalLentSettledPaise: number;
  totalBorrowedSettledPaise: number;
  activeLentCount: number;
  activeBorrowedCount: number;
}> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ direction: string; status: string; remaining: number; repaid: number; cnt: number }>(
    `SELECT direction, status, SUM(remaining_amount_paise) as remaining, SUM(repaid_amount_paise) as repaid, COUNT(*) as cnt
     FROM loans GROUP BY direction, status`,
  );
  let totalLentPendingPaise = 0;
  let totalBorrowedPendingPaise = 0;
  let totalLentSettledPaise = 0;
  let totalBorrowedSettledPaise = 0;
  let activeLentCount = 0;
  let activeBorrowedCount = 0;

  for (const r of rows) {
    if (r.direction === 'LENT') {
      if (r.status !== 'SETTLED' && r.status !== 'CANCELLED') {
        totalLentPendingPaise += r.remaining ?? 0;
        activeLentCount += r.cnt ?? 0;
      } else if (r.status === 'SETTLED') {
        totalLentSettledPaise += r.repaid ?? 0;
      }
    } else if (r.direction === 'BORROWED') {
      if (r.status !== 'SETTLED' && r.status !== 'CANCELLED') {
        totalBorrowedPendingPaise += r.remaining ?? 0;
        activeBorrowedCount += r.cnt ?? 0;
      } else if (r.status === 'SETTLED') {
        totalBorrowedSettledPaise += r.repaid ?? 0;
      }
    }
  }

  return {
    totalLentPendingPaise,
    totalBorrowedPendingPaise,
    totalLentSettledPaise,
    totalBorrowedSettledPaise,
    activeLentCount,
    activeBorrowedCount,
  };
}

/* --------------------------------- Goals --------------------------------- */

export async function listGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM goals ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    targetAmountPaise: r.target_amount_paise,
    savedAmountPaise: r.saved_amount_paise,
    targetDate: r.target_date,
    category: r.category,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createGoal(input: { name: string; targetAmountPaise: number; category?: string; targetDate?: string }): Promise<Goal> {
  const db = await getDb();
  const id = uuid();
  const at = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO goals (id, name, target_amount_paise, saved_amount_paise, target_date, category, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)',
    id, input.name.trim(), input.targetAmountPaise, input.targetDate ?? null, input.category ?? null, at, at,
  );
  bumpData();
  const r = await db.getFirstAsync<Row>('SELECT * FROM goals WHERE id = ?', id);
  return {
    id: r!.id,
    name: r!.name,
    targetAmountPaise: r!.target_amount_paise,
    savedAmountPaise: r!.saved_amount_paise,
    targetDate: r!.target_date,
    category: r!.category,
    createdAt: r!.created_at,
    updatedAt: r!.updated_at,
  };
}

export async function contributeToGoal(id: string, amountPaise: number): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await db.runAsync('UPDATE goals SET saved_amount_paise = saved_amount_paise + ?, updated_at = ? WHERE id = ?', amountPaise, at, id);
  bumpData();
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goals WHERE id = ?', id);
  bumpData();
}

/* ----------------------------- Subscriptions ----------------------------- */

export async function listSubscriptions(): Promise<Subscription[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM subscriptions WHERE active = 1 ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    amountPaise: r.amount_paise,
    frequency: r.frequency,
    nextBillingDate: r.next_billing_date,
    category: r.category,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createSubscription(input: { name: string; amountPaise: number; frequency?: 'MONTHLY' | 'WEEKLY' | 'YEARLY'; nextBillingDate?: string; category?: string }): Promise<Subscription> {
  const db = await getDb();
  const id = uuid();
  const at = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO subscriptions (id, name, amount_paise, frequency, next_billing_date, category, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
    id, input.name.trim(), input.amountPaise, input.frequency ?? 'MONTHLY', input.nextBillingDate ?? null, input.category ?? 'Bills', at, at,
  );
  bumpData();
  const r = await db.getFirstAsync<Row>('SELECT * FROM subscriptions WHERE id = ?', id);
  return {
    id: r!.id,
    name: r!.name,
    amountPaise: r!.amount_paise,
    frequency: r!.frequency,
    nextBillingDate: r!.next_billing_date,
    category: r!.category,
    active: r!.active === 1,
    createdAt: r!.created_at,
    updatedAt: r!.updated_at,
  };
}

export async function deleteSubscription(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM subscriptions WHERE id = ?', id);
  bumpData();
}

/* ------------------------- Intelligence & Position ----------------------- */

export async function getPayeeMemory(payeeName: string | null, upiId: string | null): Promise<{
  paymentCount: number;
  totalPaidPaise: number;
  averagePaidPaise: number;
  lastPaidAt: string | null;
  lastAmountPaise: number | null;
  commonCategory: string | null;
} | null> {
  if (!payeeName && !upiId) return null;
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT amount_paise, expense_date, category FROM expenses
     WHERE deleted_at IS NULL AND status = 'PAID'
       AND ((upi_id IS NOT NULL AND upi_id = ?) OR (payee_name IS NOT NULL AND payee_name = ?))
     ORDER BY expense_date DESC`,
    upiId ?? '', payeeName ?? '',
  );
  if (!rows.length) return null;
  const paymentCount = rows.length;
  const totalPaidPaise = rows.reduce((s, r) => s + (r.amount_paise ?? 0), 0);
  const averagePaidPaise = Math.round(totalPaidPaise / paymentCount);
  const lastPaidAt = rows[0].expense_date;
  const lastAmountPaise = rows[0].amount_paise;
  const catCount = new Map<string, number>();
  for (const r of rows) {
    if (r.category) catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
  }
  let commonCategory: string | null = null;
  let maxCat = 0;
  for (const [c, n] of catCount) {
    if (n > maxCat) {
      maxCat = n;
      commonCategory = c;
    }
  }
  return { paymentCount, totalPaidPaise, averagePaidPaise, lastPaidAt, lastAmountPaise, commonCategory };
}

export async function checkDuplicatePayment(
  payeeName: string | null,
  upiId: string | null,
  amountPaise: number,
  windowHours: number = 24,
): Promise<LocalExpense | null> {
  const db = await getDb();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM expenses
     WHERE deleted_at IS NULL
       AND status IN ('PAID', 'PENDING_PAYMENT', 'PAYMENT_APP_OPENED', 'USER_RETURNED')
       AND amount_paise = ?
       AND created_at >= ?
       AND ((upi_id IS NOT NULL AND upi_id = ?) OR (payee_name IS NOT NULL AND payee_name = ?))
     ORDER BY created_at DESC LIMIT 1`,
    amountPaise, since, upiId ?? '', payeeName ?? '',
  );
  return rows.length ? rowToExpense(rows[0]) : null;
}

export async function getMoneyPosition(): Promise<{
  bankBalancePaise: number;
  receivablePaise: number;
  payablePaise: number;
  usableBalancePaise: number;
  usablePaise: number;
}> {
  const kv = await kvGet('user_bank_balance_paise');
  const bankBalancePaise = kv ? parseInt(kv, 10) : 0;
  const udhaar = await getUdhaarSummary();
  const receivablePaise = udhaar.totalLentPendingPaise;
  const payablePaise = udhaar.totalBorrowedPendingPaise;
  const usableBalancePaise = bankBalancePaise + receivablePaise - payablePaise;
  return { bankBalancePaise, receivablePaise, payablePaise, usableBalancePaise, usablePaise: usableBalancePaise };
}

export async function setMoneyPosition(bankBalancePaise: number): Promise<void> {
  await kvSet('user_bank_balance_paise', String(bankBalancePaise));
  bumpData();
}

/** Case B: User-entered 12-digit UTR links to expense as RECONCILED_MANUAL. */
export async function addManualUtr(id: string, utrInput: string): Promise<LocalExpense> {
  const cleanUtr = utrInput.trim();
  if (!/^[0-9]{12}$/.test(cleanUtr)) {
    throw new Error('UTR must be exactly 12 numeric digits.');
  }
  const db = await getDb();
  const dup = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM expenses WHERE deleted_at IS NULL AND id <> ? AND utr = ?`, id, cleanUtr,
  );
  if (dup) throw new LocalDuplicateReferenceError();

  const current = await getExpense(id);
  if (!current) throw new Error('Expense not found');
  const at = new Date().toISOString();
  const e1 = uuid();
  const recStatus: ReconciliationStatus = 'RECONCILED_MANUAL';
  const conf = calculateExpenseConfidence({
    ...current,
    status: 'PAID',
    utr: cleanUtr,
    reconciliationStatus: recStatus,
    paymentConfirmationSource: 'MANUAL_UTR',
  });

  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET utr = ?, reconciliation_status = ?, confidence_level = ?, confidence_reasons = ?, payment_confirmation_source = 'MANUAL_UTR', updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      cleanUtr, recStatus, conf.level, JSON.stringify(conf.reasons), at, id,
    );
    await insertEvent(tx, {
      id: e1,
      expenseId: id,
      fromStatus: current.status,
      toStatus: current.status,
      at,
      meta: { action: 'MANUAL_UTR_ADDED', utr: cleanUtr },
    });
    await enqueue(tx, 'expense.reference', id, { id, reference: cleanUtr, eventId: e1, at, manual: true });
  });

  bumpData();
  const updated = await getExpense(id);
  return updated!;
}

export async function updateExpenseNotesAndTags(id: string, notes: string | null, tags: string[] | null): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync(
      `UPDATE expenses SET notes = ?, tags = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
      notes, tags ? JSON.stringify(tags) : null, at, id,
    );
    await enqueue(tx, 'expense.update', id, { id, patch: { notes, tags, updatedAt: at } });
  });
  bumpData();
}

/* ----------------------- Feature D: Smart Cash Envelopes ------------------- */

export interface Envelope {
  id: string;
  name: string;
  allocatedPaise: number;
  spentPaise: number;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export async function listEnvelopes(): Promise<Envelope[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM envelopes ORDER BY created_at ASC');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    allocatedPaise: r.allocated_paise,
    spentPaise: r.spent_paise,
    color: r.color,
    icon: r.icon,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function upsertEnvelope(env: {
  id?: string;
  name: string;
  allocatedPaise: number;
  spentPaise?: number;
  color?: string;
  icon?: string;
}): Promise<Envelope> {
  const db = await getDb();
  const at = new Date().toISOString();
  const id = env.id ?? uuid();
  const color = env.color ?? '#10E39A';
  const icon = env.icon ?? 'folder-outline';
  const spent = env.spentPaise ?? 0;
  await inTx(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO envelopes (id, name, allocated_paise, spent_paise, color, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, allocated_paise = excluded.allocated_paise, spent_paise = excluded.spent_paise, color = excluded.color, icon = excluded.icon, updated_at = excluded.updated_at`,
      id, env.name.trim(), env.allocatedPaise, spent, color, icon, at, at,
    );
  });
  bumpData();
  return { id, name: env.name.trim(), allocatedPaise: env.allocatedPaise, spentPaise: spent, color, icon, createdAt: at, updatedAt: at };
}

export async function transferEnvelopeFunds(fromId: string, toId: string, amountPaise: number): Promise<void> {
  const db = await getDb();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync('UPDATE envelopes SET allocated_paise = MAX(0, allocated_paise - ?), updated_at = ? WHERE id = ?', amountPaise, at, fromId);
    await tx.runAsync('UPDATE envelopes SET allocated_paise = allocated_paise + ?, updated_at = ? WHERE id = ?', amountPaise, at, toId);
  });
  bumpData();
}

export async function deleteEnvelope(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM envelopes WHERE id = ?', id);
  bumpData();
}

/* ----------------------- Feature E: Receipt Vault -------------------------- */

export interface ReceiptItem {
  id: string;
  expenseId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string | null;
  createdAt: string;
}

export async function listReceipts(expenseId: string): Promise<ReceiptItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM receipts WHERE expense_id = ? ORDER BY created_at DESC', expenseId);
  return rows.map((r) => ({
    id: r.id,
    expenseId: r.expense_id,
    fileUri: r.file_uri,
    fileName: r.file_name,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export async function addReceipt(item: {
  expenseId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  notes?: string;
}): Promise<ReceiptItem> {
  const db = await getDb();
  const id = uuid();
  const at = new Date().toISOString();
  await inTx(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO receipts (id, expense_id, file_uri, file_name, mime_type, file_size, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, item.expenseId, item.fileUri, item.fileName, item.mimeType, item.fileSize ?? 0, item.notes ?? null, at,
    );
  });
  bumpData();
  return { id, expenseId: item.expenseId, fileUri: item.fileUri, fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize ?? 0, notes: item.notes ?? null, createdAt: at };
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM receipts WHERE id = ?', id);
  bumpData();
}
