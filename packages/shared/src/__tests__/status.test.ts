import { describe, expect, it } from 'vitest';
import { applyTransition } from '../expense';
import { checkTransition, TransitionError, type ExpenseStatus } from '../status';
import type { Expense } from '../types';

const base: Expense = {
  id: 'e1', expenseCode: 'EXP-20260927-0001', userId: null, amountPaise: 85000, currency: 'INR',
  payeeName: 'Rahul Sharma', upiId: 'rahul@upi', reason: 'Project components', category: 'Education',
  status: 'DRAFT', paymentMethod: 'UPI', utr: null, transactionReference: null, paymentApp: null,
  qrSource: 'UPI_URI', qrPayload: null, notes: null, createdAt: '2026-09-27T03:44:00.000Z',
  expenseDate: '2026-09-27T03:44:00.000Z', paymentInitiatedAt: null, paymentCompletedAt: null,
  updatedAt: '2026-09-27T03:44:00.000Z', deletedAt: null,
};
let n = 0;
const step = (e: Expense, to: ExpenseStatus, reference?: string) =>
  applyTransition(e, { to, at: new Date(Date.parse('2026-09-27T03:44:00Z') + ++n * 60000).toISOString(), eventId: `ev${n}`, reference }).expense;

describe('state machine', () => {
  it('walks the happy path to PAID', () => {
    let e = step(base, 'PENDING_PAYMENT');
    e = step(e, 'PAYMENT_APP_OPENED');
    expect(e.paymentInitiatedAt).not.toBeNull();
    e = step(e, 'USER_RETURNED');
    e = step(e, 'PAYMENT_CONFIRMED_BY_USER');
    expect(e.paymentCompletedAt).not.toBeNull();
    e = step(e, 'UTR_ADDED', '6270 1234 5678');
    expect(e.utr).toBe('627012345678');
    e = step(e, 'PAID');
    expect(e.status).toBe('PAID');
  });

  it('accepts alphanumeric transaction reference', () => {
    let e: Expense = { ...base, status: 'PAYMENT_CONFIRMED_BY_USER' };
    e = step(e, 'UTR_ADDED', 'T2609271234ABCD');
    expect(e.transactionReference).toBe('T2609271234ABCD');
    expect(e.utr).toBeNull();
  });

  it('never marks PAID just because the UPI app opened', () => {
    const e = { ...base, status: 'PAYMENT_APP_OPENED' as const };
    expect(() => step(e, 'PAID')).toThrow(TransitionError);
    expect(checkTransition('PENDING_PAYMENT', 'PAID', { paymentMethod: 'UPI', amountPaise: 1 })).toBe('ILLEGAL_TRANSITION');
  });

  it('requires a valid reference for UTR_ADDED', () => {
    const e = { ...base, status: 'PAYMENT_CONFIRMED_BY_USER' as const };
    expect(() => step(e, 'UTR_ADDED', '12345')).toThrow(/REFERENCE_REQUIRED/);
    expect(() => step(e, 'UTR_ADDED')).toThrow(/REFERENCE_REQUIRED/);
  });

  it('allows failure, cancel and retry paths', () => {
    let e = step({ ...base, status: 'USER_RETURNED' }, 'FAILED');
    expect(e.paymentCompletedAt).toBeNull();
    e = step(e, 'PAYMENT_APP_OPENED');
    e = step(e, 'CANCELLED');
    expect(() => step(e, 'PAYMENT_APP_OPENED')).toThrow();
  });

  it('marks stale sessions UNCONFIRMED and lets them be resolved', () => {
    let e = step({ ...base, status: 'PAYMENT_APP_OPENED' }, 'UNCONFIRMED');
    e = step(e, 'PAYMENT_CONFIRMED_BY_USER');
    expect(e.status).toBe('PAYMENT_CONFIRMED_BY_USER');
  });

  it('only allows DRAFT→PAID for manual non-UPI records', () => {
    expect(() => step(base, 'PAID')).toThrow(/MANUAL_ONLY/);
    expect(step({ ...base, paymentMethod: 'CASH', upiId: null }, 'PAID').status).toBe('PAID');
  });

  it('requires UPI id to initiate', () => {
    expect(() => step({ ...base, upiId: null }, 'PENDING_PAYMENT')).toThrow(/UPI_ID_REQUIRED/);
  });

  it('PAID and CANCELLED are terminal', () => {
    for (const to of ['FAILED', 'CANCELLED', 'PAYMENT_APP_OPENED', 'UNCONFIRMED'] as const) {
      expect(checkTransition('PAID', to, { paymentMethod: 'UPI', amountPaise: 1, utr: '1' })).toBe('ILLEGAL_TRANSITION');
    }
  });
});
