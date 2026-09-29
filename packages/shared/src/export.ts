import { paiseToDecimalString } from './money';
import { statusLabel, type ExpenseStatus } from './status';

export interface ExportableExpense {
  expenseDate: string;
  amountPaise: number;
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  status: ExpenseStatus;
  utr: string | null;
  transactionReference: string | null;
  expenseCode: string;
  paymentApp: string | null;
}

export const EXPORT_HEADERS = ['Date', 'Time', 'Amount (INR)', 'Payee', 'UPI ID', 'Reason', 'Category', 'Status', 'UTR', 'Transaction Reference', 'Expense ID', 'Payment App'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Formats in the given UTC offset (minutes east) so server and device exports agree. */
export function exportDateTime(iso: string, tzOffsetMin: number): { date: string; time: string } {
  const d = new Date(Date.parse(iso) + tzOffsetMin * 60_000);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(h12)}:${pad(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`,
  };
}

/** CSV cell escaping with spreadsheet formula-injection protection. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function expensesToCsv(rows: ExportableExpense[], tzOffsetMin: number): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(',')];
  for (const e of rows) {
    const { date, time } = exportDateTime(e.expenseDate, tzOffsetMin);
    lines.push(
      [date, time, paiseToDecimalString(e.amountPaise), e.payeeName, e.upiId, e.reason, e.category, statusLabel(e.status),
        e.utr, e.transactionReference, e.expenseCode, e.paymentApp].map(csvCell).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
