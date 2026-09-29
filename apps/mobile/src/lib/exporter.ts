import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { expensesToCsv, exportDateTime, formatINR, statusLabel } from '@paytrack/shared';
import { tzOffsetMinutes } from './format';
import type { LocalExpense } from './repo';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function exportCsv(rows: LocalExpense[]): Promise<void> {
  const file = new File(Paths.cache, `paytrack-expenses-${stamp()}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(expensesToCsv(rows, tzOffsetMinutes()));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export expenses (CSV)', UTI: 'public.comma-separated-values-text' });
}

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function exportPdf(rows: LocalExpense[], title: string): Promise<void> {
  const tz = tzOffsetMinutes();
  const paid = rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.amountPaise, 0);
  const body = rows.map((r) => {
    const { date, time } = exportDateTime(r.expenseDate, tz);
    return `<tr><td>${date}<br><span class="m">${time}</span></td><td class="r">${formatINR(r.amountPaise, { decimals: 'always' })}</td>
      <td>${esc(r.payeeName ?? '—')}<br><span class="m">${esc(r.upiId ?? r.paymentMethod)}</span></td>
      <td>${esc(r.reason)}<br><span class="m">${esc(r.category)}</span></td><td>${esc(statusLabel(r.status))}</td>
      <td class="mono">${esc(r.utr ?? r.transactionReference ?? '—')}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0b1220;padding:24px}
    h1{font-size:20px;margin:0}.sub{color:#556;margin:4px 0 16px;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:10.5px}th{text-align:left;background:#0b1220;color:#fff;padding:6px}
    td{padding:6px;border-bottom:1px solid #e3e6ea;vertical-align:top}.r{text-align:right;font-weight:700}.m{color:#778;font-size:9.5px}
    .mono{font-family:monospace}.tot{margin:8px 0 16px;font-size:13px}
  </style></head><body>
    <h1>PayTrack — ${esc(title)}</h1>
    <div class="sub">Generated ${new Date().toLocaleString()} • ${rows.length} records • Payee details as read from scanned QR codes</div>
    <div class="tot">Total paid: <b>${formatINR(paid, { decimals: 'always' })}</b></div>
    <table><thead><tr><th>Date</th><th>Amount</th><th>Payee</th><th>Reason</th><th>Status</th><th>UTR / Ref</th></tr></thead>
    <tbody>${body}</tbody></table></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export expenses (PDF)', UTI: 'com.adobe.pdf' });
}
