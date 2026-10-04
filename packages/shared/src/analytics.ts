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
  financialType?: string | null;
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
  const live = expenses.filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE'));
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
    .filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID' && (category === '__ALL__' || e.category === category))
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
  const paid = expenses.filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID');
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
    .filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID' && e.upiId && e.upiId.trim().toLowerCase() === targetId)
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
    .filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID')
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

/* -------------------- Feature A: Cashflow Forecast ------------------------ */

export interface CashflowForecast {
  days: 7 | 30 | 90;
  historicalDailyAveragePaise: number;
  projectedTotalPaise: number;
  projectedCurve: { date: string; cumulativePaise: number; dailyPaise: number }[];
  projectedTopCategories: { category: string; projectedPaise: number }[];
}

export function calculateCashflowForecast(
  expenses: AnalyticsExpense[],
  days: 7 | 30 | 90 = 30,
  now: Date = new Date(),
): CashflowForecast {
  const paid = expenses.filter(
    (e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID',
  );

  const nowMs = now.getTime();
  const past30DaysMs = 30 * 86_400_000;
  const recentExpenses = paid.filter((e) => {
    const t = Date.parse(e.expenseDate);
    return !Number.isNaN(t) && nowMs - t <= past30DaysMs && nowMs - t >= 0;
  });

  const recentTotal = recentExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const baselineDailyAverage = recentExpenses.length > 0
    ? Math.round(recentTotal / 30)
    : paid.length > 0
    ? Math.round(paid.reduce((s, e) => s + e.amountPaise, 0) / Math.max(1, paid.length))
    : 0;

  // Category proportions from recent history
  const catTotals = new Map<string, number>();
  for (const e of recentExpenses) {
    catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amountPaise);
  }

  const projectedTotalPaise = baselineDailyAverage * days;
  const projectedTopCategories = [...catTotals.entries()]
    .map(([category, sum]) => ({
      category,
      projectedPaise: recentTotal > 0 ? Math.round((sum / recentTotal) * projectedTotalPaise) : 0,
    }))
    .sort((a, b) => b.projectedPaise - a.projectedPaise);

  const projectedCurve: CashflowForecast['projectedCurve'] = [];
  let running = 0;
  for (let i = 1; i <= days; i++) {
    const targetDate = new Date(nowMs + i * 86_400_000).toISOString().slice(0, 10);
    running += baselineDailyAverage;
    projectedCurve.push({
      date: targetDate,
      dailyPaise: baselineDailyAverage,
      cumulativePaise: running,
    });
  }

  return {
    days,
    historicalDailyAveragePaise: baselineDailyAverage,
    projectedTotalPaise,
    projectedCurve,
    projectedTopCategories,
  };
}

/* -------------------- Feature C: Expense Anomaly Detection ---------------- */

export interface ExpenseAnomaly {
  expenseId: string;
  payeeName: string;
  category: string;
  amountPaise: number;
  expectedAveragePaise: number;
  severity: 'HIGH' | 'MEDIUM';
  reason: string;
  expenseDate: string;
}

export function detectExpenseAnomalies(
  expenses: (AnalyticsExpense & { id?: string })[],
): ExpenseAnomaly[] {
  const paid = expenses.filter(
    (e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID',
  );

  // Group by category to find average and median
  const byCategory = new Map<string, number[]>();
  for (const e of paid) {
    const list = byCategory.get(e.category) ?? [];
    list.push(e.amountPaise);
    byCategory.set(e.category, list);
  }

  const categoryStats = new Map<string, { baseline: number; stdDev: number }>();
  for (const [cat, amounts] of byCategory.entries()) {
    if (amounts.length >= 2) {
      const sorted = [...amounts].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
      const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const variance = amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length;
      // Use minimum of avg and median to avoid outlier masking
      const baseline = Math.min(avg, median);
      categoryStats.set(cat, { baseline, stdDev: Math.sqrt(variance) });
    } else if (amounts.length === 1) {
      categoryStats.set(cat, { baseline: amounts[0]!, stdDev: 0 });
    }
  }

  const anomalies: ExpenseAnomaly[] = [];

  for (const e of paid) {
    const stats = categoryStats.get(e.category);
    if (!stats || stats.baseline <= 0) continue;

    const ratio = e.amountPaise / stats.baseline;
    const diffPaise = e.amountPaise - stats.baseline;

    if (ratio >= 2.0 && diffPaise >= 25_000) {
      const isHigh = ratio >= 3.5 || (stats.stdDev > 0 && e.amountPaise >= stats.baseline + 2 * stats.stdDev);
      anomalies.push({
        expenseId: e.id ?? `exp-${e.expenseDate}`,
        payeeName: e.payeeName || e.upiId || 'Direct Payment',
        category: e.category,
        amountPaise: e.amountPaise,
        expectedAveragePaise: Math.round(stats.baseline),
        severity: isHigh ? 'HIGH' : 'MEDIUM',
        reason: `${Math.round(ratio * 10) / 10}x higher than your typical ${e.category} spending (${formatINR(Math.round(stats.baseline))})`,
        expenseDate: e.expenseDate,
      });
    }
  }

  return anomalies.sort((a, b) => Date.parse(b.expenseDate) - Date.parse(a.expenseDate));
}

/* -------------------- Feature J: Financial Health Score ------------------- */

export interface HealthScoreFactor {
  title: string;
  score: number;
  maxScore: number;
  status: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';
  detail: string;
}

export interface FinancialHealthScore {
  totalScore: number; // 0 - 100
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_ATTENTION';
  factors: HealthScoreFactor[];
}

export function calculateFinancialHealthScore(params: {
  expenses: AnalyticsExpense[];
  budgets?: { amountPaise: number; spentPaise: number }[];
  loans?: { direction: 'LENT' | 'BORROWED'; remainingAmountPaise: number; originalAmountPaise: number; status: string }[];
  envelopesCount?: number;
}): FinancialHealthScore {
  const { expenses, budgets = [], loans = [], envelopesCount = 0 } = params;
  const factors: HealthScoreFactor[] = [];

  // 1. Budget Adherence (35 pts)
  let budgetScore = 35;
  let budgetDetail = 'No active budgets set.';
  let budgetStatus: HealthScoreFactor['status'] = 'GOOD';
  if (budgets.length > 0) {
    const overBudgets = budgets.filter((b) => b.spentPaise > b.amountPaise).length;
    const ratio = overBudgets / budgets.length;
    if (overBudgets === 0) {
      budgetScore = 35;
      budgetDetail = `All ${budgets.length} budgets are on track.`;
      budgetStatus = 'EXCELLENT';
    } else {
      budgetScore = Math.max(10, Math.round(35 * (1 - ratio)));
      budgetDetail = `${overBudgets} of ${budgets.length} budgets exceeded.`;
      budgetStatus = 'NEEDS_ATTENTION';
    }
  }
  factors.push({ title: 'Budget Adherence', score: budgetScore, maxScore: 35, status: budgetStatus, detail: budgetDetail });

  // 2. Spending Consistency (25 pts)
  const paid = expenses.filter((e) => !e.deletedAt && (!e.financialType || e.financialType === 'EXPENSE') && e.status === 'PAID');
  let consistencyScore = 20;
  let consistencyDetail = 'Steady recorded transaction volume.';
  let consistencyStatus: HealthScoreFactor['status'] = 'GOOD';
  if (paid.length >= 10) {
    consistencyScore = 25;
    consistencyStatus = 'EXCELLENT';
    consistencyDetail = 'Strong tracking consistency across recent transactions.';
  } else if (paid.length >= 3) {
    consistencyScore = 20;
    consistencyStatus = 'GOOD';
    consistencyDetail = 'Growing transaction history.';
  } else {
    consistencyScore = 15;
    consistencyStatus = 'NEEDS_ATTENTION';
    consistencyDetail = 'Log more payments to build baseline history.';
  }
  factors.push({ title: 'Spending Consistency', score: consistencyScore, maxScore: 25, status: consistencyStatus, detail: consistencyDetail });

  // 3. Debt Management (25 pts)
  let debtScore = 25;
  let debtDetail = 'No outstanding borrowed debts.';
  let debtStatus: HealthScoreFactor['status'] = 'EXCELLENT';
  const borrowed = loans.filter((l) => l.direction === 'BORROWED' && l.status === 'OPEN');
  if (borrowed.length > 0) {
    const totalBorrowedPaise = borrowed.reduce((s, l) => s + l.remainingAmountPaise, 0);
    debtScore = 15;
    debtStatus = 'NEEDS_ATTENTION';
    debtDetail = `${borrowed.length} active debts (${formatINR(totalBorrowedPaise)}) to repay.`;
  }
  factors.push({ title: 'Debt Management', score: debtScore, maxScore: 25, status: debtStatus, detail: debtDetail });

  // 4. Planning & Envelopes (15 pts)
  let envelopeScore = 15;
  let envelopeDetail = envelopesCount > 0 ? `${envelopesCount} cash envelopes active.` : 'Create cash envelopes to boost financial planning.';
  let envelopeStatus: HealthScoreFactor['status'] = envelopesCount > 0 ? 'EXCELLENT' : 'GOOD';
  if (envelopesCount === 0) envelopeScore = 10;
  factors.push({ title: 'Planning & Envelopes', score: envelopeScore, maxScore: 15, status: envelopeStatus, detail: envelopeDetail });

  const totalScore = Math.min(100, Math.max(0, factors.reduce((sum, f) => sum + f.score, 0)));
  const rating: FinancialHealthScore['rating'] =
    totalScore >= 80 ? 'EXCELLENT' : totalScore >= 65 ? 'GOOD' : totalScore >= 50 ? 'FAIR' : 'NEEDS_ATTENTION';

  return { totalScore, rating, factors };
}

