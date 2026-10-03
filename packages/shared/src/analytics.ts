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
  reason?: string | null;
  mode?: string | null;
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

/* ----------------------- Feature 8: Payment DNA -------------------------- */

export interface PaymentDna {
  averagePaymentPaise: number;
  largestPaymentPaise: number;
  mostFrequentPayee: { name: string; count: number } | null;
  mostFrequentCategory: { name: string; count: number } | null;
  mostActiveDayOfWeek: { day: string; count: number } | null; // e.g. "Saturday"
  smallPaymentsCount: number; // <= ₹200 (20,000 paise)
  largePaymentsCount: number; // >= ₹2,000 (200,000 paise)
  totalPaidCount: number;
  totalSpentPaise: number;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Calculates private spending DNA strictly from PAID transactions. */
export function calculatePaymentDna(expenses: AnalyticsExpense[]): PaymentDna {
  const paid = expenses.filter((e) => !e.deletedAt && e.status === 'PAID');
  if (paid.length === 0) {
    return {
      averagePaymentPaise: 0,
      largestPaymentPaise: 0,
      mostFrequentPayee: null,
      mostFrequentCategory: null,
      mostActiveDayOfWeek: null,
      smallPaymentsCount: 0,
      largePaymentsCount: 0,
      totalPaidCount: 0,
      totalSpentPaise: 0,
    };
  }

  let totalPaise = 0;
  let largestPaise = 0;
  let smallCount = 0;
  let largeCount = 0;

  const payeeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const dayOfWeekCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

  for (const e of paid) {
    const a = e.amountPaise;
    totalPaise += a;
    if (a > largestPaise) largestPaise = a;
    if (a <= 20_000) smallCount++; // <= ₹200
    if (a >= 200_000) largeCount++; // >= ₹2000

    const pk = e.payeeName || e.upiId;
    if (pk) {
      payeeCounts.set(pk, (payeeCounts.get(pk) ?? 0) + 1);
    }
    categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1);

    const d = new Date(e.expenseDate);
    const dayIdx = d.getDay();
    if (!Number.isNaN(dayIdx) && dayIdx >= 0 && dayIdx < 7) {
      dayOfWeekCounts[dayIdx] = (dayOfWeekCounts[dayIdx] ?? 0) + 1;
    }
  }

  let topPayee: { name: string; count: number } | null = null;
  for (const [name, count] of payeeCounts.entries()) {
    if (!topPayee || count > topPayee.count) {
      topPayee = { name, count };
    }
  }

  let topCat: { name: string; count: number } | null = null;
  for (const [name, count] of categoryCounts.entries()) {
    if (!topCat || count > topCat.count) {
      topCat = { name, count };
    }
  }

  let maxDayIdx = 0;
  let maxDayCount = 0;
  for (let i = 0; i < 7; i++) {
    const count = dayOfWeekCounts[i] ?? 0;
    if (count > maxDayCount) {
      maxDayCount = count;
      maxDayIdx = i;
    }
  }

  return {
    averagePaymentPaise: Math.round(totalPaise / paid.length),
    largestPaymentPaise: largestPaise,
    mostFrequentPayee: topPayee,
    mostFrequentCategory: topCat,
    mostActiveDayOfWeek: maxDayCount > 0 ? { day: DAYS_OF_WEEK[maxDayIdx] ?? 'Unknown', count: maxDayCount } : null,
    smallPaymentsCount: smallCount,
    largePaymentsCount: largeCount,
    totalPaidCount: paid.length,
    totalSpentPaise: totalPaise,
  };
}

/* ------------------ Feature 5: Recurring Payee Intelligence --------------- */

export interface RecurringPayeeInfo {
  upiId: string;
  payeeName: string | null;
  count: number;
  totalPaidPaise: number;
  averageIntervalDays: number | null;
  intervalDescription: string | null; // e.g. "~30 days", "~7 days", "Frequent"
  commonPurpose: string | null;
  commonCategory: string | null;
  isRecurring: boolean;
}

/**
 * Analyzes historical paid transactions for a given UPI ID to detect
 * frequency intervals (e.g. "~30 days" for rent/broadband) and common purposes.
 */
export function analyzeRecurringPayee(expenses: AnalyticsExpense[], upiId: string): RecurringPayeeInfo | null {
  if (!upiId) return null;
  const targetId = upiId.trim().toLowerCase();

  const matching = expenses
    .filter((e) => !e.deletedAt && e.status === 'PAID' && e.upiId && e.upiId.trim().toLowerCase() === targetId)
    .sort((a, b) => Date.parse(a.expenseDate) - Date.parse(b.expenseDate));

  if (matching.length === 0) return null;

  let totalPaid = 0;
  let payeeName: string | null = null;
  const purposeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const m of matching) {
    totalPaid += m.amountPaise;
    if (!payeeName && m.payeeName) payeeName = m.payeeName;
    if (m.reason) purposeCounts.set(m.reason, (purposeCounts.get(m.reason) ?? 0) + 1);
    categoryCounts.set(m.category, (categoryCounts.get(m.category) ?? 0) + 1);
  }

  // Top purpose & category
  let topPurpose: string | null = null;
  let topPCount = 0;
  for (const [p, count] of purposeCounts.entries()) {
    if (count > topPCount) {
      topPurpose = p;
      topPCount = count;
    }
  }

  let topCat: string | null = null;
  let topCCount = 0;
  for (const [c, count] of categoryCounts.entries()) {
    if (count > topCCount) {
      topCat = c;
      topCCount = count;
    }
  }

  // Calculate interval if count >= 2
  let avgIntervalDays: number | null = null;
  let intervalDesc: string | null = null;
  let isRecurring = false;

  if (matching.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < matching.length; i++) {
      const prev = Date.parse(matching[i - 1]?.expenseDate ?? '');
      const curr = Date.parse(matching[i]?.expenseDate ?? '');
      if (!Number.isNaN(prev) && !Number.isNaN(curr)) {
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) intervals.push(diffDays);
      }
    }

    if (intervals.length > 0) {
      const sum = intervals.reduce((acc, v) => acc + v, 0);
      avgIntervalDays = Math.round(sum / intervals.length);

      if (avgIntervalDays >= 25 && avgIntervalDays <= 35) {
        intervalDesc = '~30 days (Monthly)';
        isRecurring = true;
      } else if (avgIntervalDays >= 6 && avgIntervalDays <= 8) {
        intervalDesc = '~7 days (Weekly)';
        isRecurring = true;
      } else if (avgIntervalDays <= 2) {
        intervalDesc = 'Daily / Frequent';
        isRecurring = matching.length >= 3;
      } else {
        intervalDesc = `~${avgIntervalDays} days`;
        isRecurring = matching.length >= 3;
      }
    }
  }

  return {
    upiId,
    payeeName,
    count: matching.length,
    totalPaidPaise: totalPaid,
    averageIntervalDays: avgIntervalDays,
    intervalDescription: intervalDesc,
    commonPurpose: topPurpose,
    commonCategory: topCat,
    isRecurring,
  };
}

/* -------------------- Feature 9: Money Journey --------------------------- */

export interface MoneyJourneyStep {
  id: string;
  expenseDate: string;
  timeFormatted: string;
  payeeName: string;
  category: string;
  amountPaise: number;
  reason: string;
  mode?: string | null;
  cumulativeDayPaise: number;
}

/** Builds an interactive chronological spending replay timeline. */
export function buildMoneyJourney(
  expenses: (AnalyticsExpense & { id?: string })[],
  selectedDay?: string, // YYYY-MM-DD
): MoneyJourneyStep[] {
  const paid = expenses
    .filter((e) => !e.deletedAt && e.status === 'PAID')
    .sort((a, b) => Date.parse(a.expenseDate) - Date.parse(b.expenseDate));

  const filtered = selectedDay
    ? paid.filter((e) => e.expenseDate.startsWith(selectedDay))
    : paid.slice(-25); // latest 25 payments for journey

  let runningDayTotal = 0;
  let lastDayKey = '';

  return filtered.map((e, idx) => {
    const d = new Date(e.expenseDate);
    const dayKey = d.toISOString().slice(0, 10);
    if (dayKey !== lastDayKey) {
      runningDayTotal = 0;
      lastDayKey = dayKey;
    }
    runningDayTotal += e.amountPaise;

    const timeFormatted = Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      id: e.id ?? `step-${idx}`,
      expenseDate: e.expenseDate,
      timeFormatted,
      payeeName: e.payeeName || e.upiId || 'Direct Payment',
      category: e.category,
      amountPaise: e.amountPaise,
      reason: e.reason || 'Expense',
      mode: e.mode ?? null,
      cumulativeDayPaise: runningDayTotal,
    };
  });
}

