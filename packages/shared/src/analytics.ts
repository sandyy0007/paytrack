/**
 * Pure analytics over expense records. Shared by the offline app and server.
 * "Spending" only counts PAID expenses — anything unconfirmed is reported
 * separately so we never overstate or hide uncertainty.
 */
import type { ExpenseStatus } from './status';
import { formatINR } from './money';

export interface AnalyticsExpense {
  amountPaise: number;
  status: ExpenseStatus;
  category: string;
  payeeName: string | null;
  upiId: string | null;
  expenseDate: string; // ISO
  deletedAt?: string | null;
}

const DAY = 86_400_000;

/** Converts an instant to a "local" Date whose UTC fields equal local wall-clock fields. */
function shift(iso: string | Date, tzOffsetMin: number): Date {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(t + tzOffsetMin * 60_000);
}
export function localDayKey(iso: string | Date, tzOffsetMin: number): string {
  return shift(iso, tzOffsetMin).toISOString().slice(0, 10);
}
function localMonthKey(iso: string | Date, tzOffsetMin: number): string {
  return shift(iso, tzOffsetMin).toISOString().slice(0, 7);
}
/** Monday-start week key (YYYY-MM-DD of Monday). */
function localWeekStartKey(iso: string | Date, tzOffsetMin: number): string {
  const d = shift(iso, tzOffsetMin);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

export interface Summary {
  todayPaise: number;
  weekPaise: number;
  monthPaise: number;
  monthCount: number;
  weekCount: number;
  monthAveragePaise: number;
  largest: { amountPaise: number; payee: string | null } | null;
  pendingCount: number;
  pendingPaise: number;
  categories: { category: string; amountPaise: number; count: number; share: number }[];
  topPayees: { payee: string; amountPaise: number; count: number }[];
  daily: { day: string; amountPaise: number }[]; // last 14 days
  monthly: { month: string; amountPaise: number }[]; // last 6 months
  allTimePaise: number;
  allTimeCount: number;
}

const PENDING: ExpenseStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_APP_OPENED',
  'USER_RETURNED',
  'PAYMENT_CONFIRMED_BY_USER',
  'UTR_ADDED',
  'UNCONFIRMED',
];

export function summarize(expenses: AnalyticsExpense[], now: Date, tzOffsetMin: number): Summary {
  const live = expenses.filter((e) => !e.deletedAt);
  const paid = live.filter((e) => e.status === 'PAID');
  const todayKey = localDayKey(now, tzOffsetMin);
  const weekKey = localWeekStartKey(now, tzOffsetMin);
  const monthKey = localMonthKey(now, tzOffsetMin);

  let today = 0, week = 0, month = 0, monthCount = 0, weekCount = 0, allTime = 0;
  let largest: Summary['largest'] = null;
  const cat = new Map<string, { a: number; c: number }>();
  const payees = new Map<string, { a: number; c: number }>();
  const daily = new Map<string, number>();
  const monthly = new Map<string, number>();

  for (let i = 13; i >= 0; i--) daily.set(localDayKey(new Date(now.getTime() - i * DAY), tzOffsetMin), 0);
  const nowLocal = shift(now, tzOffsetMin);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() - i, 1));
    monthly.set(d.toISOString().slice(0, 7), 0);
  }

  for (const e of paid) {
    const a = e.amountPaise;
    allTime += a;
    const dk = localDayKey(e.expenseDate, tzOffsetMin);
    const mk = localMonthKey(e.expenseDate, tzOffsetMin);
    if (dk === todayKey) today += a;
    if (localWeekStartKey(e.expenseDate, tzOffsetMin) === weekKey) {
      week += a;
      weekCount++;
    }
    if (daily.has(dk)) daily.set(dk, (daily.get(dk) ?? 0) + a);
    if (monthly.has(mk)) monthly.set(mk, (monthly.get(mk) ?? 0) + a);
    if (mk === monthKey) {
      month += a;
      monthCount++;
      const c = cat.get(e.category) ?? { a: 0, c: 0 };
      c.a += a; c.c++;
      cat.set(e.category, c);
      const pk = e.payeeName || e.upiId || null; // cash records may have no payee
      if (pk) {
        const p = payees.get(pk) ?? { a: 0, c: 0 };
        p.a += a; p.c++;
        payees.set(pk, p);
      }
      if (!largest || a > largest.amountPaise) largest = { amountPaise: a, payee: pk };
    }
  }

  const pending = live.filter((e) => PENDING.includes(e.status));

  return {
    todayPaise: today,
    weekPaise: week,
    monthPaise: month,
    monthCount,
    weekCount,
    monthAveragePaise: monthCount ? Math.round(month / monthCount) : 0,
    largest,
    pendingCount: pending.length,
    pendingPaise: pending.reduce((s, e) => s + e.amountPaise, 0),
    categories: [...cat.entries()]
      .map(([category, v]) => ({ category, amountPaise: v.a, count: v.c, share: month ? v.a / month : 0 }))
      .sort((x, y) => y.amountPaise - x.amountPaise),
    topPayees: [...payees.entries()]
      .map(([payee, v]) => ({ payee, amountPaise: v.a, count: v.c }))
      .sort((x, y) => y.amountPaise - x.amountPaise)
      .slice(0, 5),
    daily: [...daily.entries()].map(([day, amountPaise]) => ({ day, amountPaise })),
    monthly: [...monthly.entries()].map(([m, amountPaise]) => ({ month: m, amountPaise })),
    allTimePaise: allTime,
    allTimeCount: paid.length,
  };
}

/** Descriptive, factual insights only — no financial advice. */
export function buildInsights(s: Summary): string[] {
  const out: string[] = [];
  const top = s.categories[0];
  if (top) {
    out.push(`You spent ${formatINR(top.amountPaise)} on ${top.category} this month.`);
    if (s.categories.length > 1) {
      out.push(`${top.category} accounts for ${Math.round(top.share * 100)}% of your recorded spending this month.`);
    }
  }
  if (s.monthCount > 0) out.push(`Your average transaction this month is ${formatINR(s.monthAveragePaise)}.`);
  if (s.weekCount > 0) out.push(`${s.weekCount} payment${s.weekCount === 1 ? ' was' : 's were'} recorded this week.`);
  if (s.largest) out.push(`Your largest payment this month was ${formatINR(s.largest.amountPaise)}${s.largest.payee ? ` to ${s.largest.payee}` : ''}.`);
  if (s.pendingCount > 0) {
    out.push(`${s.pendingCount} payment${s.pendingCount === 1 ? '' : 's'} (${formatINR(s.pendingPaise)}) still need confirmation and are not counted above.`);
  }
  return out;
}

export interface BudgetUsage {
  spentPaise: number;
  limitPaise: number;
  ratio: number;
  level: 'OK' | 'WARN' | 'HIGH' | 'OVER';
  crossedThreshold: number | null;
}

export function budgetUsage(spentPaise: number, limitPaise: number, thresholds: number[] = [75, 90, 100]): BudgetUsage {
  const ratio = limitPaise > 0 ? spentPaise / limitPaise : 0;
  const pct = ratio * 100;
  const sorted = [...thresholds].sort((a, b) => a - b);
  const crossed = sorted.filter((t) => pct >= t).pop() ?? null;
  const level: BudgetUsage['level'] =
    pct >= 100 ? 'OVER' : crossed != null && crossed >= (sorted[1] ?? 90) ? 'HIGH' : crossed != null ? 'WARN' : 'OK';
  return { spentPaise, limitPaise, ratio, level, crossedThreshold: crossed };
}

/** Sum of PAID spending in the budget's current period. */
export function spentInPeriod(
  expenses: AnalyticsExpense[],
  category: string,
  period: 'WEEKLY' | 'MONTHLY',
  now: Date,
  tzOffsetMin: number,
): number {
  const key = period === 'MONTHLY' ? localMonthKey(now, tzOffsetMin) : localWeekStartKey(now, tzOffsetMin);
  return expenses
    .filter((e) => !e.deletedAt && e.status === 'PAID' && (category === '__ALL__' || e.category === category))
    .filter((e) =>
      period === 'MONTHLY'
        ? localMonthKey(e.expenseDate, tzOffsetMin) === key
        : localWeekStartKey(e.expenseDate, tzOffsetMin) === key,
    )
    .reduce((s, e) => s + e.amountPaise, 0);
}
