import { buildUpiPaymentUri, parseUpiQr, type UpiPayload } from '@paytrack/shared';
import { getExpense, transition, type LocalExpense } from './repo';
import { scheduleSync } from './sync';

/** Rebuilds the parsed QR payload stored with the expense (needed for retries). */
export function payloadFromExpense(e: LocalExpense): UpiPayload | null {
  if (!e.upiId) return null;
  let params: Record<string, string> = { pa: e.upiId };
  if (e.qrPayload) {
    try {
      params = JSON.parse(e.qrPayload);
    } catch {
      /* fall back to UPI id only */
    }
  }
  if (!params.pa) params.pa = e.upiId;
  if (!params.pn && e.payeeName) params.pn = e.payeeName;
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = parseUpiQr(`upi://pay?${query}`);
  return r.ok ? r.payload : null;
}

export function buildUriForExpense(e: LocalExpense, shareNote: boolean): string {
  const p = payloadFromExpense(e);
  if (!p) throw new Error('Payment details are missing for this expense.');
  return buildUpiPaymentUri(p, { amountPaise: e.amountPaise, note: shareNote ? e.reason : undefined });
}

/** Ensures the expense reached USER_RETURNED before the user's answer is recorded. */
export async function ensureReturned(id: string): Promise<LocalExpense> {
  const e = await getExpense(id);
  if (!e) throw new Error('Expense not found');
  if (e.status === 'PAYMENT_APP_OPENED') return transition(id, 'USER_RETURNED');
  return e;
}

export async function run<T>(fn: () => Promise<T>): Promise<T> {
  const r = await fn();
  scheduleSync();
  return r;
}
