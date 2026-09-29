import { assertTransition, type ExpenseStatus } from './status';
import type { Expense, ExpenseEvent } from './types';
import { classifyReference } from './utr';

export interface TransitionInput {
  to: ExpenseStatus;
  at: string; // ISO
  eventId: string;
  reference?: string | null;
  paymentApp?: string | null;
  meta?: ExpenseEvent['meta'];
}

/**
 * Pure transition function shared by app and server. Returns the updated
 * expense and the timeline event. Throws TransitionError on illegal moves.
 */
export function applyTransition(expense: Expense, input: TransitionInput): { expense: Expense; event: ExpenseEvent } {
  let utr = expense.utr;
  let transactionReference = expense.transactionReference;

  if (input.to === 'UTR_ADDED') {
    const r = classifyReference(input.reference ?? '');
    if (!r.ok) {
      // Let the state machine raise REFERENCE_REQUIRED consistently.
      utr = null;
      transactionReference = null;
    } else if (r.kind === 'UTR') {
      utr = r.value;
    } else {
      transactionReference = r.value;
    }
  }

  assertTransition(expense.status, input.to, {
    paymentMethod: expense.paymentMethod,
    amountPaise: expense.amountPaise,
    upiId: expense.upiId,
    utr,
    transactionReference,
  });

  const next: Expense = { ...expense, utr, transactionReference, status: input.to, updatedAt: input.at };
  if (input.to === 'PAYMENT_APP_OPENED') {
    next.paymentInitiatedAt = expense.paymentInitiatedAt ?? input.at;
    if (input.paymentApp) next.paymentApp = input.paymentApp;
  }
  if (input.to === 'PAYMENT_CONFIRMED_BY_USER') next.paymentCompletedAt = input.at;
  if (input.to === 'PAID' && !next.paymentCompletedAt) next.paymentCompletedAt = input.at;
  if (input.to === 'FAILED' || input.to === 'CANCELLED') next.paymentCompletedAt = null;

  return {
    expense: next,
    event: {
      id: input.eventId,
      expenseId: expense.id,
      fromStatus: expense.status,
      toStatus: input.to,
      at: input.at,
      meta: input.meta,
    },
  };
}

/** Local-date expense code: EXP-YYYYMMDD-NNNN */
export function formatExpenseCode(date: Date, seq: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `EXP-${y}${m}${d}-${String(seq % 10000).padStart(4, '0')}`;
}

export const REASON_MAX = 120;
export const NOTES_MAX = 500;
