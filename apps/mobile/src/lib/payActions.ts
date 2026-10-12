import { buildUpiPaymentUri, getZeroAlterationUpiLaunchUri, parseUpiQr, type UpiPayload } from '@paytrack/shared';
import { getExpense, transition, type LocalExpense } from './repo';
import { scheduleSync } from './sync';

/** Extracts the raw QR payload from an expense if available. */
export function extractRawQrPayload(e: LocalExpense): string | null {
  if (e.rawQrPayload && typeof e.rawQrPayload === 'string' && e.rawQrPayload.trim().toLowerCase().startsWith('upi:')) {
    return e.rawQrPayload.trim();
  }
  if (!e.qrPayload) return null;
  const trimmed = typeof e.qrPayload === 'string' ? e.qrPayload.trim() : '';
  if (trimmed.toLowerCase().startsWith('upi:')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.raw === 'string' && parsed.raw.trim().toLowerCase().startsWith('upi:')) {
      return parsed.raw.trim();
    }
  } catch {
    /* fallback */
  }
  return null;
}

/** Rebuilds the parsed QR payload stored with the expense (needed for retries and launches). */
export function payloadFromExpense(e: LocalExpense): UpiPayload | null {
  if (!e.upiId && !e.qrPayload) return null;

  // 1. Direct raw UPI URI stored in qrPayload
  if (e.qrPayload && typeof e.qrPayload === 'string' && e.qrPayload.trim().toLowerCase().startsWith('upi:')) {
    const r = parseUpiQr(e.qrPayload.trim());
    if (r.ok) return r.payload;
  }

  // 2. Structured JSON storing raw URI and/or params
  if (e.qrPayload) {
    try {
      const parsed = JSON.parse(e.qrPayload);
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.raw === 'string' && parsed.raw.trim().toLowerCase().startsWith('upi:')) {
          const r = parseUpiQr(parsed.raw.trim());
          if (r.ok) return r.payload;
        }
        const params: Record<string, string> = (parsed.params && typeof parsed.params === 'object') ? parsed.params : parsed;
        if (!params.pa && e.upiId) params.pa = e.upiId;
        if (!params.pn && e.payeeName) params.pn = e.payeeName;
        const query = Object.entries(params)
          .filter(([_, v]) => v != null && v !== '')
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&');
        const r = parseUpiQr(`upi://pay?${query}`);
        if (r.ok) return r.payload;
      }
    } catch {
      /* fall back */
    }
  }

  // 3. Fallback: recreate minimal UPI payload from upiId and payeeName
  if (e.upiId) {
    const query = `pa=${encodeURIComponent(e.upiId)}${e.payeeName ? `&pn=${encodeURIComponent(e.payeeName)}` : ''}`;
    const r = parseUpiQr(`upi://pay?${query}`);
    return r.ok ? r.payload : null;
  }

  return null;
}

/**
 * QR Zero-Alteration Launch URI:
 * When payment originates from a scanned QR (Camera or Gallery),
 * the URI passed to the external UPI app MUST be the original QR payload with ZERO alterations.
 *
 * - Signed or fixed-amount QRs: passed 100% byte-for-byte identical.
 * - Dynamic-amount QRs (no am= parameter): append '&am=' + amount + '&cu=INR' without altering existing parameters.
 * - Manual UPI entry (MANUAL_UPI or no raw QR): reconstruct using buildUpiPaymentUri().
 */
export function getLaunchUri(expense: LocalExpense, shareNote: boolean): string {
  const raw = extractRawQrPayload(expense);
  const p = payloadFromExpense(expense);
  return getZeroAlterationUpiLaunchUri(p, {
    rawQrPayload: raw,
    qrSource: expense.qrSource,
    amountPaise: expense.amountPaise,
    reason: expense.reason,
    shareNote,
  });
}

export function buildUriForExpense(e: LocalExpense, shareNote: boolean): string {
  return getLaunchUri(e, shareNote);
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
