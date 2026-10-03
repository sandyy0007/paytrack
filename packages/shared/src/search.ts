import { formatINR, parseRupeesToPaise } from './money';

export interface SearchableExpense {
  amountPaise: number;
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  utr: string | null;
  transactionReference: string | null;
  transactionId?: string | null;
  expenseCode: string;
  expenseDate: string;
  status?: string | null;
  mode?: string | null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Intelligent free-text match covering:
 * amount, payee, UPI ID, category, purpose (reason), date, month, status, txn ID, txn reference, UTR, mode.
 */
export function matchesQuery(e: SearchableExpense, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((tok) => matchToken(e, tok));
}

function matchToken(e: SearchableExpense, tok: string): boolean {
  const hay = [
    e.payeeName,
    e.upiId,
    e.reason,
    e.category,
    e.utr,
    e.transactionReference,
    e.transactionId,
    e.expenseCode,
    e.status,
    e.mode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (hay.includes(tok)) return true;

  // Currency / amount matching: ₹850, 850, 850.00
  if (/^₹?[\d,]+(\.\d{1,2})?$/.test(tok)) {
    const r = parseRupeesToPaise(tok);
    if (r.ok && r.paise === e.amountPaise) return true;
    if (formatINR(e.amountPaise, { symbol: false }).replace(/,/g, '').startsWith(tok.replace(/[₹,]/g, ''))) return true;
    const plainRupees = (e.amountPaise / 100).toString();
    if (plainRupees.startsWith(tok.replace(/[₹,]/g, ''))) return true;
  }

  // Month matching: "oct", "october"
  if (tok.length >= 3) {
    const monthIdx = MONTHS.findIndex((m) => m.startsWith(tok));
    if (monthIdx >= 0) {
      const d = new Date(e.expenseDate);
      if (!Number.isNaN(d.getTime()) && d.getMonth() === monthIdx) return true;
    }
  }

  // Date matching: YYYY-MM-DD or DD-MM-YYYY or partial day
  if (e.expenseDate && e.expenseDate.includes(tok)) {
    return true;
  }

  return false;
}
