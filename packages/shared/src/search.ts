import { formatINR, parseRupeesToPaise } from './money';

export interface SearchableExpense {
  amountPaise: number;
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  utr: string | null;
  transactionReference: string | null;
  expenseCode: string;
  expenseDate: string;
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/** Intelligent free-text match: payee, UPI ID, reason, category, UTR, "₹850", month names. */
export function matchesQuery(e: SearchableExpense, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((tok) => matchToken(e, tok));
}

function matchToken(e: SearchableExpense, tok: string): boolean {
  const hay = [e.payeeName, e.upiId, e.reason, e.category, e.utr, e.transactionReference, e.expenseCode]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes(tok)) return true;

  if (/^₹?[\d,]+(\.\d{1,2})?$/.test(tok)) {
    const r = parseRupeesToPaise(tok);
    if (r.ok && r.paise === e.amountPaise) return true;
    if (formatINR(e.amountPaise, { symbol: false }).replace(/,/g, '').startsWith(tok.replace(/[₹,]/g, ''))) return true;
  }
  if (tok.length >= 3) {
    const monthIdx = MONTHS.findIndex((m) => m.startsWith(tok));
    if (monthIdx >= 0) {
      const d = new Date(e.expenseDate);
      if (d.getMonth() === monthIdx) return true;
    }
  }
  return false;
}
