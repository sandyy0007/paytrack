import { describe, expect, it } from 'vitest';
import { budgetUsage, buildInsights, summarize } from '../analytics';
import { formatExpenseCode } from '../expense';
import { formatINR, formatINRCompact, parseRupeesToPaise } from '../money';
import { matchesQuery } from '../search';
import { classifyReference, extractUtrCandidates } from '../utr';

describe('money', () => {
  it('parses rupee strings to paise', () => {
    expect(parseRupeesToPaise('850')).toEqual({ ok: true, paise: 85000 });
    expect(parseRupeesToPaise('850.5')).toEqual({ ok: true, paise: 85050 });
    expect(parseRupeesToPaise('₹1,250.00')).toEqual({ ok: true, paise: 125000 });
    expect(parseRupeesToPaise('0.5').ok).toBe(false);
    expect(parseRupeesToPaise('1.234').ok).toBe(false);
    expect(parseRupeesToPaise('').ok).toBe(false);
  });
  it('formats INR with Indian grouping', () => {
    expect(formatINR(2485000)).toBe('₹24,850');
    expect(formatINR(1234567890)).toBe('₹1,23,45,678.90');
    expect(formatINR(85050)).toBe('₹850.50');
    expect(formatINRCompact(34000000)).toBe('₹3.4L');
  });
});

describe('references', () => {
  it('classifies UTR vs transaction id', () => {
    expect(classifyReference('627012345678')).toMatchObject({ ok: true, kind: 'UTR' });
    expect(classifyReference('t2609 2712-34abcd')).toMatchObject({ ok: true, kind: 'TXN_REF', value: 'T26092712' + '34ABCD' });
    expect(classifyReference('12345').ok).toBe(false);
    expect(classifyReference('ABCDEFGHIJ').ok).toBe(false);
    expect(classifyReference('').ok).toBe(false);
  });
  it('extracts plausible UTRs from clipboard text and ranks phones low', () => {
    const now = new Date('2026-09-27T10:00:00Z');
    const text = 'Paid ₹850 to Rahul. UPI Ref No: 627012345678. Call 919876543210. id 1234567890123';
    expect(extractUtrCandidates(text, now)).toEqual(['627012345678']);
    expect(extractUtrCandidates('627012345678', now)).toEqual(['627012345678']);
    expect(extractUtrCandidates('nothing here', now)).toEqual([]);
  });
});

describe('analytics', () => {
  const now = new Date('2026-09-27T06:00:00Z'); // 11:30 IST
  const IST = 330;
  const mk = (amountPaise: number, iso: string, category = 'Food', status: any = 'PAID', payeeName = 'A') =>
    ({ amountPaise, expenseDate: iso, category, status, payeeName, upiId: null });
  const data = [
    mk(85000, '2026-09-27T03:44:00Z', 'Education', 'PAID', 'Rahul Sharma'),
    mk(24000, '2026-09-26T19:00:00Z'), // 00:30 IST on 27th → today in IST
    mk(10000, '2026-09-22T05:00:00Z'), // Tue same week
    mk(50000, '2026-09-02T05:00:00Z'),
    mk(99900, '2026-08-15T05:00:00Z'),
    mk(12000, '2026-09-27T05:00:00Z', 'Food', 'PAYMENT_CONFIRMED_BY_USER'),
  ];
  it('computes totals in local time and excludes unconfirmed', () => {
    const s = summarize(data, now, IST);
    expect(s.todayPaise).toBe(109000);
    expect(s.weekPaise).toBe(119000);
    expect(s.monthPaise).toBe(169000);
    expect(s.monthCount).toBe(4);
    expect(s.pendingCount).toBe(1);
    expect(s.largest).toEqual({ amountPaise: 85000, payee: 'Rahul Sharma' });
    expect(s.categories[0]?.category).toBe('Education');
    expect(s.daily).toHaveLength(14);
    expect(s.monthly.at(-1)).toEqual({ month: '2026-09', amountPaise: 169000 });
    const ins = buildInsights(s);
    expect(ins[0]).toBe('You spent ₹850 on Education this month.');
    expect(ins.some((x) => x.includes('not counted'))).toBe(true);
  });
  it('budget usage levels', () => {
    expect(budgetUsage(520000, 800000).level).toBe('OK');
    expect(budgetUsage(600000, 800000).level).toBe('WARN');
    expect(budgetUsage(730000, 800000).level).toBe('HIGH');
    expect(budgetUsage(800000, 800000).level).toBe('OVER');
  });
});

describe('search & ids', () => {
  const e = { amountPaise: 85000, payeeName: 'Rahul Sharma', upiId: 'rahul@upi', reason: 'Project components',
    category: 'Education', utr: '627012345678', transactionReference: null, expenseCode: 'EXP-20260927-0017', expenseDate: '2026-09-27T03:44:00Z' };
  it.each(['Rahul', 'project', '₹850', '850', 'September', 'sept', '627012345678', 'rahul project'])('matches %s', (q) =>
    expect(matchesQuery(e, q)).toBe(true));
  it.each(['food', '₹851', 'October'])('does not match %s', (q) => expect(matchesQuery(e, q)).toBe(false));
  it('formats expense code', () => expect(formatExpenseCode(new Date(2026, 8, 27), 17)).toBe('EXP-20260927-0017'));
});

import { csvCell, expensesToCsv } from '../export';
describe('csv export', () => {
  it('escapes and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
  });
  it('renders rows in local time', () => {
    const csv = expensesToCsv([{ expenseDate: '2026-09-27T03:44:00Z', amountPaise: 85000, payeeName: 'Rahul Sharma', upiId: 'rahul@upi',
      reason: 'Project Components', category: 'Education', status: 'PAID', utr: '627012345678', transactionReference: null,
      expenseCode: 'EXP-20260927-0017', paymentApp: 'Google Pay' }], 330);
    expect(csv.split('\r\n')[1]).toBe('2026-09-27,09:14 AM,850.00,Rahul Sharma,rahul@upi,Project Components,Education,Paid,627012345678,,EXP-20260927-0017,Google Pay');
  });
});
