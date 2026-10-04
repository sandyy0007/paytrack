import {
  buildInsights, buildMoneyJourney, calculateCashflowForecast, calculateFinancialHealthScore,
  calculatePaymentDna, DEFAULT_CATEGORIES, detectExpenseAnomalies, formatINR, summarize,
} from '@paytrack/shared';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, DonutChart, LineChart } from '@/components/Charts';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/PayeeCard';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { AnalyticsCard, ChartCard } from '@/components/StatCard';
import { EmptyState, InlineNotice, LoadingState } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate, tzOffsetMinutes } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { expensesSince, getUdhaarSummary, listBudgets, listCategories, listEnvelopes, listLoans } from '@/lib/repo';
import { syncNow } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type TabType = 'OVERVIEW' | 'FORECAST' | 'CALENDAR' | 'REPORTS';

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [forecastDays, setForecastDays] = useState<7 | 30 | 90>(30);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [generatingReport, setGeneratingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const q = useLiveQuery(async () => {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const [rows, cats, udhaar, budgets, envelopes, loans] = await Promise.all([
      expensesSince(since),
      listCategories(),
      getUdhaarSummary(),
      listBudgets(),
      listEnvelopes(),
      listLoans(),
    ]);

    const s = summarize(rows, now, tzOffsetMinutes());
    const dna = calculatePaymentDna(rows);
    const journey = buildMoneyJourney(rows, selectedCalendarDay);
    const anomalies = detectExpenseAnomalies(rows);
    const forecast = calculateCashflowForecast(rows, forecastDays, now);
    const health = calculateFinancialHealthScore({
      expenses: rows,
      budgets: budgets.map((b) => ({ amountPaise: b.amountPaise, spentPaise: 0 })),
      loans: loans,
      envelopesCount: envelopes.length,
    });

    return { s, insights: buildInsights(s), cats, dna, journey, udhaar, anomalies, forecast, health, rows };
  }, [forecastDays, selectedCalendarDay]);

  const d = q.data;
  const colorOf = (name: string) =>
    d?.cats.find((c) => c.name === name)?.color ??
    DEFAULT_CATEGORIES.find((c) => c.name === name)?.color ??
    colors.textSecondary;
  const today = new Date();
  const dayOfMonth = today.getDate();

  const handleGeneratePdfReport = async () => {
    if (!d) return;
    setGeneratingReport(true);
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>PayTrack Month-End Financial Report</title>
          <style>
            body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; background: #fff; color: #1e293b; }
            h1 { color: #0f172a; font-size: 28px; margin-bottom: 4px; }
            h2 { color: #334155; font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 24px; }
            .badge { display: inline-block; padding: 4px 10px; background: #dcfce7; color: #15803d; border-radius: 999px; font-size: 13px; font-weight: bold; }
            .grid { display: flex; gap: 16px; margin: 16px 0; }
            .card { flex: 1; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
            .val { font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            th { background: #f1f5f9; color: #475569; }
            .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <h1>PayTrack Financial Report</h1>
          <p style="color: #64748b; margin-top: 0;">Period: ${MONTHS[today.getMonth()]} ${today.getFullYear()} · Generated automatically</p>
          <span class="badge">Health Score: ${d.health.totalScore}/100 (${d.health.rating})</span>

          <div class="grid">
            <div class="card"><div>Month Total Spending</div><div class="val">${formatINR(d.s.monthPaise)}</div></div>
            <div class="card"><div>Total Payments</div><div class="val">${d.s.monthCount}</div></div>
            <div class="card"><div>Average Payment</div><div class="val">${formatINR(d.s.monthAveragePaise)}</div></div>
          </div>

          <h2>Top Category Breakdown</h2>
          <table>
            <tr><th>Category</th><th>Amount</th><th>Share</th><th>Transactions</th></tr>
            ${d.s.categories
              .map(
                (c) =>
                  `<tr><td>${c.category}</td><td>${formatINR(c.amountPaise)}</td><td>${Math.round(c.share * 100)}%</td><td>${c.count}</td></tr>`,
              )
              .join('')}
          </table>

          <h2>Financial Separation (Udhaar)</h2>
          <table>
            <tr><th>Type</th><th>Pending Amount</th></tr>
            <tr><td>Money Lent (Lena Hai - Recoverable)</td><td>${formatINR(d.udhaar.totalLentPendingPaise)}</td></tr>
            <tr><td>Money Borrowed (Dena Hai - Payable)</td><td>${formatINR(d.udhaar.totalBorrowedPendingPaise)}</td></tr>
          </table>

          <div class="footer">PayTrack · Smart Payment-First Expense Engine · Local Offline-First</div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Report Saved', `PDF saved locally to: ${uri}`);
      }
      void haptic.success();
    } catch (err) {
      Alert.alert('Report Error', 'Could not generate PDF report.');
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <Screen
      bottomInset={TAB_CONTENT_INSET}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await syncNow();
        setRefreshing(false);
      }}
    >
      <View>
        <Text style={type.h1} accessibilityRole="header">Analytics & Insights</Text>
        <Text style={type.label}>{MONTHS[today.getMonth()]} {today.getFullYear()} · verified spending</Text>
      </View>

      {/* Progressive Disclosure Section Tabs */}
      <View style={styles.tabBar}>
        <ScalePressable
          onPress={() => { setActiveTab('OVERVIEW'); void haptic.select(); }}
          style={[styles.tabItem, activeTab === 'OVERVIEW' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'OVERVIEW' && styles.tabTextActive]}>Overview</Text>
        </ScalePressable>
        <ScalePressable
          onPress={() => { setActiveTab('FORECAST'); void haptic.select(); }}
          style={[styles.tabItem, activeTab === 'FORECAST' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'FORECAST' && styles.tabTextActive]}>Forecast</Text>
        </ScalePressable>
        <ScalePressable
          onPress={() => { setActiveTab('CALENDAR'); void haptic.select(); }}
          style={[styles.tabItem, activeTab === 'CALENDAR' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'CALENDAR' && styles.tabTextActive]}>Calendar</Text>
        </ScalePressable>
        <ScalePressable
          onPress={() => { setActiveTab('REPORTS'); void haptic.select(); }}
          style={[styles.tabItem, activeTab === 'REPORTS' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'REPORTS' && styles.tabTextActive]}>Reports</Text>
        </ScalePressable>
      </View>

      {!d ? (
        <LoadingState rows={4} />
      ) : d.s.allTimeCount === 0 && d.s.pendingCount === 0 ? (
        <GlassCard>
          <EmptyState
            icon="pie-chart-outline"
            title="No spending recorded yet"
            message="Analytics appear as soon as your first payment is confirmed."
            cta="+ Pay"
            onCta={() => router.push('/pay')}
          />
        </GlassCard>
      ) : activeTab === 'OVERVIEW' ? (
        <>
          {/* Feature J: Financial Health Score */}
          <GlassCard padding={space.xl} variant="hero">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={type.label}>Financial Health Score</Text>
                <Text style={[type.h1, { color: colors.primary, marginTop: space.xxs }]}>
                  {d.health.totalScore}
                  <Text style={[type.body, { color: colors.textSecondary }]}> / 100</Text>
                </Text>
              </View>
              <View
                style={[
                  styles.healthPill,
                  {
                    backgroundColor:
                      d.health.rating === 'EXCELLENT'
                        ? 'rgba(16, 227, 154, 0.15)'
                        : d.health.rating === 'GOOD'
                        ? 'rgba(34, 211, 238, 0.15)'
                        : 'rgba(251, 191, 36, 0.15)',
                  },
                ]}
              >
                <Text
                  style={[
                    type.caption,
                    {
                      color:
                        d.health.rating === 'EXCELLENT'
                          ? colors.primary
                          : d.health.rating === 'GOOD'
                          ? colors.cyan
                          : colors.warning,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {d.health.rating}
                </Text>
              </View>
            </View>

            <View style={{ gap: space.sm, marginTop: space.md }}>
              {d.health.factors.map((f) => (
                <View key={f.title} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={type.caption}>{f.title}</Text>
                    <Text style={[type.caption, { color: colors.text }]}>{f.score}/{f.maxScore}</Text>
                  </View>
                  <View style={styles.scoreBarTrack}>
                    <View
                      style={[
                        styles.scoreBarFill,
                        { width: `${(f.score / f.maxScore) * 100}%`, backgroundColor: colors.primary },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* Feature C: Expense Anomaly Alert */}
          {d.anomalies.length > 0 ? (
            <GlassCard padding={space.lg}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
                <Icon name="warning-outline" size={18} color={colors.warning} />
                <Text style={type.h3}>Spending Anomaly Detected</Text>
              </View>
              <Text style={type.bodyStrong}>{d.anomalies[0]?.payeeName} · {formatINR(d.anomalies[0]?.amountPaise ?? 0)}</Text>
              <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {d.anomalies[0]?.reason}
              </Text>
            </GlassCard>
          ) : null}

          {/* Metric Cards */}
          <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <AnalyticsCard label="Total this month" value={formatINR(d.s.monthPaise)} icon="wallet-outline" sub={`${d.s.monthCount} payments`} />
              <AnalyticsCard label="This week" value={formatINR(d.s.weekPaise)} icon="calendar-outline" tint={colors.cyan} sub={`${d.s.weekCount} payments`} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <AnalyticsCard label="Average payment" value={formatINR(d.s.monthAveragePaise)} icon="stats-chart-outline" tint={colors.cyan} />
              <AnalyticsCard label="Largest" value={d.s.largest ? formatINR(d.s.largest.amountPaise) : '—'} icon="trending-up-outline" sub={d.s.largest?.payee ?? undefined} />
            </View>
          </Animated.View>

          {/* Charts */}
          <ChartCard title="Category breakdown" subtitle="This month · tap to focus">
            {d.s.categories.length ? (
              <DonutChart
                centerLabel="This month"
                data={d.s.categories.map((c) => ({
                  label: c.category,
                  value: c.amountPaise,
                  color: colorOf(c.category),
                }))}
              />
            ) : (
              <Text style={type.caption}>No paid payments this month yet.</Text>
            )}
          </ChartCard>

          <ChartCard title="Daily spending" subtitle="Last 14 days · tap a bar">
            <BarChart
              data={d.s.daily.map((x, i) => {
                const dt = new Date(`${x.day}T00:00:00`);
                return {
                  label: `${dt.getDate()} ${MONTHS[dt.getMonth()]}`,
                  value: x.amountPaise,
                  highlight: i === d.s.daily.length - 1,
                };
              })}
            />
          </ChartCard>

          <ChartCard title="Monthly trend" subtitle="Last 6 months">
            <LineChart
              data={d.s.monthly.map((m) => ({
                label: MONTHS[Number(m.month.slice(5, 7)) - 1]!,
                value: m.amountPaise,
              }))}
            />
          </ChartCard>
        </>
      ) : activeTab === 'FORECAST' ? (
        <>
          {/* Feature A: Cashflow Forecast */}
          <GlassCard padding={space.xl} variant="hero">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={type.label}>Projected Outflow ({forecastDays} Days)</Text>
                <Text style={[type.h1, { color: colors.cyan, marginTop: space.xxs }]}>
                  {formatINR(d.forecast.projectedTotalPaise)}
                </Text>
              </View>
              <View style={styles.daysToggleWrap}>
                {([7, 30, 90] as const).map((days) => (
                  <ScalePressable
                    key={days}
                    onPress={() => { setForecastDays(days); void haptic.select(); }}
                    style={[styles.dayToggleBtn, forecastDays === days && styles.dayToggleBtnActive]}
                  >
                    <Text style={[styles.dayToggleText, forecastDays === days && styles.dayToggleTextActive]}>
                      {days}d
                    </Text>
                  </ScalePressable>
                ))}
              </View>
            </View>

            <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={type.caption}>
                Daily baseline: <Text style={type.bodyStrong}>{formatINR(d.forecast.historicalDailyAveragePaise)}/day</Text> (calculated from verified transactions)
              </Text>
            </View>
          </GlassCard>

          <ChartCard title="Projected Trajectory" subtitle={`Next ${forecastDays} days cumulative projection`}>
            <LineChart
              data={d.forecast.projectedCurve.filter((_, idx) => idx % Math.ceil(forecastDays / 6) === 0).map((c) => ({
                label: c.date.slice(5),
                value: c.cumulativePaise,
              }))}
            />
          </ChartCard>

          <GlassCard padding={space.lg}>
            <Text style={type.h3}>Projected Top Categories</Text>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {d.forecast.projectedTopCategories.slice(0, 5).map((cat) => (
                <View key={cat.category} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={type.body}>{cat.category}</Text>
                  <Text style={type.bodyStrong}>{formatINR(cat.projectedPaise)}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        </>
      ) : activeTab === 'CALENDAR' ? (
        <>
          {/* Feature B: Financial Calendar */}
          <GlassCard padding={space.lg}>
            <Text style={type.h3}>Spending Calendar</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>Select a date to inspect timeline</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md }}>
              {d.s.daily.map((x) => {
                const dt = new Date(`${x.day}T00:00:00`);
                const isSelected = x.day === selectedCalendarDay;
                return (
                  <ScalePressable
                    key={x.day}
                    onPress={() => { setSelectedCalendarDay(x.day); void haptic.select(); }}
                    style={[
                      styles.calendarDayChip,
                      isSelected && styles.calendarDayChipActive,
                      x.amountPaise > 0 && !isSelected && styles.calendarDayChipHasExpense,
                    ]}
                  >
                    <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextActive]}>
                      {dt.getDate()}
                    </Text>
                    <View
                      style={[
                        styles.calendarDot,
                        { backgroundColor: x.amountPaise > 0 ? (isSelected ? colors.onPrimary : colors.primary) : 'transparent' },
                      ]}
                    />
                  </ScalePressable>
                );
              })}
            </View>
          </GlassCard>

          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
              <Text style={type.h3}>Day Activity: {selectedCalendarDay}</Text>
              <Text style={type.caption}>{d.journey.length} transaction{d.journey.length === 1 ? '' : 's'}</Text>
            </View>

            {d.journey.length === 0 ? (
              <Text style={[type.caption, { color: colors.textMuted, marginVertical: space.md }]}>
                No verified payments recorded on this date.
              </Text>
            ) : (
              <View style={{ gap: space.md, marginTop: space.xs }}>
                {d.journey.map((step) => (
                  <View key={step.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong}>{step.payeeName}</Text>
                      <Text style={type.caption}>{step.reason} · {step.category}</Text>
                    </View>
                    <Text style={type.money}>{formatINR(step.amountPaise)}</Text>
                  </View>
                ))}
              </View>
            )}
          </GlassCard>
        </>
      ) : (
        <>
          {/* Feature I: Smart Month-End Reports & Payment DNA */}
          <GlassCard padding={space.xl} variant="hero">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
              <Icon name="document-text-outline" size={24} color={colors.primary} />
              <Text style={type.h2}>Month-End Statement</Text>
            </View>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: space.xs }]}>
              Generate a clean, audit-ready PDF summary of your income, expenses, and Udhaar loans to download or share.
            </Text>
            <View style={{ marginTop: space.lg }}>
              <ScalePressable
                onPress={handleGeneratePdfReport}
                style={[styles.pdfButton, generatingReport && { opacity: 0.6 }]}
                disabled={generatingReport}
              >
                <Icon name="share-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.pdfButtonText}>
                  {generatingReport ? 'Generating...' : 'Export & Share PDF Statement'}
                </Text>
              </ScalePressable>
            </View>
          </GlassCard>

          {/* Payment DNA */}
          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Icon name="finger-print" size={20} color={colors.primary} />
              <View>
                <Text style={type.h3}>Payment DNA</Text>
                <Text style={type.caption}>Your spending rhythm & habits</Text>
              </View>
            </View>

            <View style={{ gap: space.sm, marginTop: space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={type.caption}>Average Payment Size</Text>
                <Text style={type.bodyStrong}>{formatINR(d.dna.averagePaymentPaise)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={type.caption}>Largest Payment</Text>
                <Text style={type.bodyStrong}>{formatINR(d.dna.largestPaymentPaise)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={type.caption}>Peak Activity Rhythm</Text>
                <Text style={[type.bodyStrong, { color: colors.cyan }]}>
                  {d.dna.mostActiveDayOfWeek ? `${d.dna.mostActiveDayOfWeek.day}s (${d.dna.mostActiveDayOfWeek.count} txns)` : '—'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={type.caption}>Top Payee</Text>
                <Text style={type.bodyStrong}>{d.dna.mostFrequentPayee?.name ?? '—'}</Text>
              </View>
            </View>
          </GlassCard>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: space.md,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  healthPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  scoreBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginTop: 4,
  },
  scoreBarFill: {
    height: 4,
    borderRadius: 2,
  },
  daysToggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.pill,
    padding: 2,
  },
  dayToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dayToggleBtnActive: {
    backgroundColor: colors.cyan,
  },
  dayToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  dayToggleTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  calendarDayChip: {
    width: 40,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayChipActive: {
    backgroundColor: colors.primary,
  },
  calendarDayChipHasExpense: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  calendarDayTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  pdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.primary,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  pdfButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
