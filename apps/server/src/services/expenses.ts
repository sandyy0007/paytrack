import { randomUUID } from 'node:crypto';
import {
  applyTransition, parseRupeesToPaise, type Expense, type ExpenseEvent, type ExpenseStatus,
} from '@paytrack/shared';
import type { z } from 'zod';
import type { Queryable, Tx } from '../db';
import { ApiError, notFound } from '../lib/errors';
import type { expenseCreate, expensePatch, listQuery } from '../lib/schemas';

const COLS = `id, expense_code, user_id, amount_paise, currency, payee_name, upi_id, reason, category, status, payment_method,
  utr, transaction_reference, payment_app, qr_source, qr_payload, notes, created_at, expense_date, payment_initiated_at,
  payment_completed_at, updated_at, deleted_at`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToExpense(r: any): Expense {
  return {
    id: r.id,
    expenseCode: r.expense_code,
    userId: r.user_id,
    amountPaise: Number(r.amount_paise),
    currency: 'INR',
    payeeName: r.payee_name,
    upiId: r.upi_id,
    reason: r.reason,
    category: r.category,
    status: r.status,
    paymentMethod: r.payment_method,
    utr: r.utr,
    transactionReference: r.transaction_reference,
    paymentApp: r.payment_app,
    qrSource: r.qr_source,
    qrPayload: r.qr_payload ? JSON.stringify(r.qr_payload) : null,
    notes: r.notes,
    createdAt: iso(r.created_at)!,
    expenseDate: iso(r.expense_date)!,
    paymentInitiatedAt: iso(r.payment_initiated_at),
    paymentCompletedAt: iso(r.payment_completed_at),
    updatedAt: iso(r.updated_at)!,
    deletedAt: iso(r.deleted_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToEvent(r: any): ExpenseEvent {
  return { id: r.id, expenseId: r.expense_id, fromStatus: r.from_status, toStatus: r.to_status, at: r.at.toISOString(), meta: r.meta ?? undefined };
}

export async function createExpense(tx: Tx, userId: string, body: z.infer<typeof expenseCreate>): Promise<{ expense: Expense; created: boolean }> {
  const ins = await tx.query(
    `INSERT INTO expenses (id, user_id, expense_code, amount_paise, currency, payee_name, upi_id, reason, category, status,
       payment_method, qr_source, qr_payload, notes, created_at, expense_date, updated_at)
     VALUES ($1,$2,$3,$4,'INR',$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${COLS}`,
    [
      body.id, userId, body.expenseCode, body.amountPaise, body.payeeName ?? null, body.upiId ?? null, body.reason, body.category,
      body.paymentMethod, body.qrSource, body.qrPayload ?? null, body.notes ?? null, body.createdAt,
      body.expenseDate ?? body.createdAt, body.updatedAt ?? body.createdAt,
    ],
  );
  if (ins.rows[0]) {
    await tx.query(
      'INSERT INTO expense_events (id, expense_id, user_id, from_status, to_status, at) VALUES ($1,$2,$3,NULL,$4,$5) ON CONFLICT (id) DO NOTHING',
      [body.draftEventId ?? randomUUID(), body.id, userId, 'DRAFT', body.createdAt],
    );
    return { expense: rowToExpense(ins.rows[0]), created: true };
  }
  // Idempotent retry: must belong to the same user.
  const existing = await tx.query(`SELECT ${COLS} FROM expenses WHERE id = $1 AND user_id = $2`, [body.id, userId]);
  if (!existing.rows[0]) throw new ApiError(409, 'CONFLICT', 'This record already exists.');
  return { expense: rowToExpense(existing.rows[0]), created: false };
}

export async function getExpense(db: Queryable, userId: string, id: string, forUpdate = false): Promise<Expense> {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM expenses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id, userId],
  );
  if (!rows[0]) throw notFound('Expense');
  return rowToExpense(rows[0]);
}

export async function getEvents(db: Queryable, userId: string, expenseId: string): Promise<ExpenseEvent[]> {
  const { rows } = await db.query(
    'SELECT * FROM expense_events WHERE expense_id = $1 AND user_id = $2 ORDER BY at, created_at',
    [expenseId, userId],
  );
  return rows.map(rowToEvent);
}

async function persist(tx: Tx, e: Expense, ev: ExpenseEvent, userId: string) {
  await tx.query(
    `UPDATE expenses SET status=$3, utr=$4, transaction_reference=$5, payment_app=$6, payment_initiated_at=$7,
       payment_completed_at=$8, updated_at=$9, server_updated_at=clock_timestamp()
     WHERE id=$1 AND user_id=$2`,
    [e.id, userId, e.status, e.utr, e.transactionReference, e.paymentApp, e.paymentInitiatedAt, e.paymentCompletedAt, e.updatedAt],
  );
  await tx.query(
    'INSERT INTO expense_events (id, expense_id, user_id, from_status, to_status, at, meta) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [ev.id, e.id, userId, ev.fromStatus, ev.toStatus, ev.at, ev.meta ?? null],
  );
}

export interface TransitionArgs {
  to: ExpenseStatus;
  at?: string;
  eventId?: string;
  reference?: string;
  paymentApp?: string;
  meta?: ExpenseEvent['meta'];
}

/** Applies one validated state-machine step. Idempotent per eventId. */
export async function transitionExpense(tx: Tx, userId: string, id: string, a: TransitionArgs): Promise<Expense> {
  const current = await getExpense(tx, userId, id, true);
  const eventId = a.eventId ?? randomUUID();
  const dup = await tx.query('SELECT 1 FROM expense_events WHERE id = $1 AND expense_id = $2', [eventId, id]);
  if (dup.rowCount) return current;

  const { expense, event } = applyTransition(current, {
    to: a.to,
    at: a.at ?? new Date().toISOString(),
    eventId,
    reference: a.reference,
    paymentApp: a.paymentApp,
    meta: a.meta,
  });
  await persist(tx, expense, event, userId);
  return expense;
}

/** Saves the UTR and finalises the expense: UTR_ADDED → PAID atomically. */
export async function recordReference(tx: Tx, userId: string, id: string, reference: string, eventId?: string, at?: string): Promise<Expense> {
  const when = at ?? new Date().toISOString();
  const current = await getExpense(tx, userId, id, true);
  if (current.status === 'PAID') {
    if (eventId) {
      const dup = await tx.query('SELECT 1 FROM expense_events WHERE id = $1 AND expense_id = $2', [eventId, id]);
      if (dup.rowCount) return current;
    }
    throw new ApiError(409, 'ALREADY_PAID', 'This expense is already marked paid.');
  }
  await transitionExpense(tx, userId, id, { to: 'UTR_ADDED', at: when, eventId, reference });
  return transitionExpense(tx, userId, id, { to: 'PAID', at: when });
}

export async function updateExpense(tx: Tx, userId: string, id: string, patch: z.infer<typeof expensePatch>): Promise<Expense> {
  const current = await getExpense(tx, userId, id, true);
  const moneyEdit = patch.amountPaise !== undefined && patch.amountPaise !== current.amountPaise;
  const payeeEdit = patch.payeeName !== undefined && patch.payeeName !== current.payeeName;
  if ((moneyEdit || payeeEdit) && current.status !== 'DRAFT' && current.paymentMethod === 'UPI') {
    throw new ApiError(409, 'FIELD_LOCKED', 'Amount and payee cannot be changed after the payment slip is created.');
  }
  const { rows } = await tx.query(
    `UPDATE expenses SET
       reason = COALESCE($3, reason), category = COALESCE($4, category),
       notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
       expense_date = COALESCE($7, expense_date), amount_paise = COALESCE($8, amount_paise),
       payee_name = CASE WHEN $9::boolean THEN $10 ELSE payee_name END,
       updated_at = COALESCE($11, now()), server_updated_at = clock_timestamp()
     WHERE id = $1 AND user_id = $2 RETURNING ${COLS}`,
    [id, userId, patch.reason ?? null, patch.category ?? null, patch.notes !== undefined, patch.notes ?? null,
      patch.expenseDate ?? null, patch.amountPaise ?? null, patch.payeeName !== undefined, patch.payeeName ?? null, patch.updatedAt ?? null],
  );
  return rowToExpense(rows[0]);
}

export async function deleteExpense(db: Queryable, userId: string, id: string): Promise<void> {
  const r = await db.query(
    'UPDATE expenses SET deleted_at = now(), updated_at = now(), server_updated_at = clock_timestamp() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [id, userId],
  );
  if (!r.rowCount) {
    const exists = await db.query('SELECT 1 FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!exists.rowCount) throw notFound('Expense');
  }
}

const BUCKET_STATUSES: Record<string, ExpenseStatus[]> = {
  PAID: ['PAID'],
  PENDING: ['DRAFT', 'PENDING_PAYMENT', 'PAYMENT_APP_OPENED', 'USER_RETURNED', 'PAYMENT_CONFIRMED_BY_USER', 'UTR_ADDED'],
  FAILED: ['FAILED'],
  UNCONFIRMED: ['UNCONFIRMED'],
  CANCELLED: ['CANCELLED'],
};

export async function listExpenses(db: Queryable, userId: string, q: z.infer<typeof listQuery>) {
  const where = ['user_id = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [userId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (q.bucket !== 'ALL') add('status = ANY(?)', BUCKET_STATUSES[q.bucket]);
  if (q.from) add('expense_date >= ?', q.from);
  if (q.to) add('expense_date < ?', q.to);
  if (q.category) add('category = ?', q.category);
  if (q.q) {
    params.push(`%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    const p = `$${params.length}`;
    const amount = parseRupeesToPaise(q.q);
    let amountSql = '';
    if (amount.ok) {
      params.push(amount.paise);
      amountSql = ` OR amount_paise = $${params.length}`;
    }
    where.push(`(payee_name ILIKE ${p} OR upi_id ILIKE ${p} OR reason ILIKE ${p} OR category ILIKE ${p} OR utr ILIKE ${p}
      OR transaction_reference ILIKE ${p} OR expense_code ILIKE ${p}${amountSql})`);
  }
  if (q.cursor) {
    const [d, id] = Buffer.from(q.cursor, 'base64url').toString().split('|');
    if (!d || !id || Number.isNaN(Date.parse(d))) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
    params.push(d, id);
    where.push(`(expense_date, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(q.limit + 1);
  const { rows } = await db.query(
    `SELECT ${COLS} FROM expenses WHERE ${where.join(' AND ')} ORDER BY expense_date DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  const items = rows.slice(0, q.limit).map(rowToExpense);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > q.limit && last ? Buffer.from(`${last.expenseDate}|${last.id}`).toString('base64url') : null,
  };
}
