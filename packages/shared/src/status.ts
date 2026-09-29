/**
 * Expense payment status state machine.
 *
 * Core rule: opening a UPI app is NOT a successful payment. An expense only
 * becomes PAID after the user confirms completion AND supplies a UTR /
 * transaction reference (or, for non-UPI manual records, via RECORDED path).
 */

export const EXPENSE_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAYMENT_APP_OPENED',
  'USER_RETURNED',
  'PAYMENT_CONFIRMED_BY_USER',
  'UTR_ADDED',
  'PAID',
  'FAILED',
  'CANCELLED',
  'UNCONFIRMED',
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const PAYMENT_METHODS = ['UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSITIONS: Readonly<Record<ExpenseStatus, readonly ExpenseStatus[]>> = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED', 'PAID'],
  PENDING_PAYMENT: ['PAYMENT_APP_OPENED', 'CANCELLED'],
  PAYMENT_APP_OPENED: ['USER_RETURNED', 'CANCELLED', 'UNCONFIRMED'],
  USER_RETURNED: ['PAYMENT_CONFIRMED_BY_USER', 'FAILED', 'CANCELLED', 'PAYMENT_APP_OPENED', 'UNCONFIRMED'],
  PAYMENT_CONFIRMED_BY_USER: ['UTR_ADDED', 'FAILED'],
  UTR_ADDED: ['PAID'],
  UNCONFIRMED: ['PAYMENT_CONFIRMED_BY_USER', 'FAILED', 'CANCELLED', 'PAYMENT_APP_OPENED'],
  FAILED: ['PAYMENT_APP_OPENED', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

export interface TransitionContext {
  paymentMethod: PaymentMethod;
  amountPaise: number;
  upiId?: string | null;
  utr?: string | null;
  transactionReference?: string | null;
}

export type TransitionErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'REFERENCE_REQUIRED'
  | 'UPI_ID_REQUIRED'
  | 'AMOUNT_REQUIRED'
  | 'MANUAL_ONLY';

export class TransitionError extends Error {
  constructor(
    public readonly code: TransitionErrorCode,
    public readonly from: ExpenseStatus,
    public readonly to: ExpenseStatus,
    message?: string,
  ) {
    super(message ?? `Cannot move expense from ${from} to ${to} (${code})`);
    this.name = 'TransitionError';
  }
}

export function isExpenseStatus(v: unknown): v is ExpenseStatus {
  return typeof v === 'string' && (EXPENSE_STATUSES as readonly string[]).includes(v);
}

/** Returns null when allowed, or the reason it is not. */
export function checkTransition(
  from: ExpenseStatus,
  to: ExpenseStatus,
  ctx: TransitionContext,
): TransitionErrorCode | null {
  if (!TRANSITIONS[from].includes(to)) return 'ILLEGAL_TRANSITION';
  const hasRef = Boolean(ctx.utr || ctx.transactionReference);
  const isUpi = ctx.paymentMethod === 'UPI';

  switch (to) {
    case 'PENDING_PAYMENT':
      if (!(ctx.amountPaise > 0)) return 'AMOUNT_REQUIRED';
      if (isUpi && !ctx.upiId) return 'UPI_ID_REQUIRED';
      if (!isUpi) return 'ILLEGAL_TRANSITION';
      return null;
    case 'PAYMENT_APP_OPENED':
      if (!isUpi) return 'ILLEGAL_TRANSITION';
      if (!ctx.upiId) return 'UPI_ID_REQUIRED';
      if (!(ctx.amountPaise > 0)) return 'AMOUNT_REQUIRED';
      return null;
    case 'UTR_ADDED':
      return hasRef ? null : 'REFERENCE_REQUIRED';
    case 'PAID':
      if (from === 'DRAFT') {
        // Direct DRAFT → PAID is only for manually recorded non-UPI expenses (cash etc.).
        if (isUpi) return 'MANUAL_ONLY';
        return ctx.amountPaise > 0 ? null : 'AMOUNT_REQUIRED';
      }
      return hasRef ? null : 'REFERENCE_REQUIRED';
    default:
      return null;
  }
}

export function assertTransition(from: ExpenseStatus, to: ExpenseStatus, ctx: TransitionContext): void {
  const err = checkTransition(from, to, ctx);
  if (err) throw new TransitionError(err, from, to);
}

export const TERMINAL_STATUSES: readonly ExpenseStatus[] = ['PAID', 'CANCELLED'];

/** Four user-facing buckets from the spec: PAID / PENDING / FAILED / UNCONFIRMED (+ cancelled). */
export type StatusBucket = 'PAID' | 'PENDING' | 'FAILED' | 'UNCONFIRMED' | 'CANCELLED';

export function statusBucket(s: ExpenseStatus): StatusBucket {
  switch (s) {
    case 'PAID':
      return 'PAID';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'UNCONFIRMED':
      return 'UNCONFIRMED';
    default:
      return 'PENDING';
  }
}

/** Human label shown in badges/detail. Always text, never colour alone. */
export function statusLabel(s: ExpenseStatus): string {
  switch (s) {
    case 'DRAFT':
      return 'Draft';
    case 'PENDING_PAYMENT':
      return 'Payment pending';
    case 'PAYMENT_APP_OPENED':
      return 'Awaiting confirmation';
    case 'USER_RETURNED':
      return 'Awaiting confirmation';
    case 'PAYMENT_CONFIRMED_BY_USER':
      return 'UTR missing';
    case 'UTR_ADDED':
      return 'Finalising';
    case 'PAID':
      return 'Paid';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'UNCONFIRMED':
      return 'Unconfirmed';
  }
}

/** Expenses the user should revisit (dedicated Pending section). */
export function needsAttention(s: ExpenseStatus): boolean {
  return (
    s === 'PENDING_PAYMENT' ||
    s === 'PAYMENT_APP_OPENED' ||
    s === 'USER_RETURNED' ||
    s === 'PAYMENT_CONFIRMED_BY_USER' ||
    s === 'UTR_ADDED' ||
    s === 'UNCONFIRMED'
  );
}

/** Timeline wording for a status change event. */
export function timelineLabel(to: ExpenseStatus, from?: ExpenseStatus | null): string {
  switch (to) {
    case 'DRAFT':
      return 'Expense created';
    case 'PENDING_PAYMENT':
      return 'Payment slip generated';
    case 'PAYMENT_APP_OPENED':
      return from === 'FAILED' || from === 'USER_RETURNED' || from === 'UNCONFIRMED'
        ? 'Payment retried in UPI app'
        : 'Payment initiated in UPI app';
    case 'USER_RETURNED':
      return 'Returned from UPI app';
    case 'PAYMENT_CONFIRMED_BY_USER':
      return 'You confirmed the payment';
    case 'UTR_ADDED':
      return 'Transaction reference added';
    case 'PAID':
      return from === 'DRAFT' ? 'Recorded as paid (manual)' : 'Expense marked paid';
    case 'FAILED':
      return 'Marked as failed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'UNCONFIRMED':
      return 'Marked unconfirmed — no confirmation received';
  }
}
