import { buildInsights, buildMoneyJourney, calculatePaymentDna, DEFAULT_CATEGORIES, formatINR, summarize } from '@paytrack/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BarChart, DonutChart, LineChart } from '@/components/Charts';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/PayeeCard';
import { Screen } from '@/components/Screen';
import { AnalyticsCard, ChartCard } from '@/components/StatCard';
import { EmptyState, LoadingState } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { useLiveQuery } from '@/lib/dataVersion';
import { tzOffsetMinutes } from '@/lib/format';
import { expensesSince, getUdhaarSummary, listCategories } from '@/lib/repo';
import { syncNow } from '@/lib/sync';
import { colors, space, type } from '@/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Analytics() {
  const [refreshing, setRefreshing] = useState(false);
  const q = useLiveQuery(async () => {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const [rows, cats, udhaar] = await Promise.all([expensesSince(since), listCategories(), getUdhaarSummary()]);
    const s = summarize(rows, now, tzOffsetMinutes());
    const dna = calculatePaymentDna(rows);
    const journey = buildMoneyJourney(rows);
    return { s, insights: buildInsights(s), cats, dna, journey, udhaar };
  });

  const d = q.data;
  const colorOf = (name: string) => d?.cats.find((c) => c.name === name)?.color ?? DEFAULT_CATEGORIES.find((c) => c.name === name)?.color ?? colors.textSecondary;
  const today = new Date();
  const dayOfMonth = today.getDate();

  return (
    <Screen bottomInset={TAB_CONTENT_INSET} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await syncNow(); setRefreshing(false); }}>
      <View>
        <Text style={type.h1} accessibilityRole="header">Analytics</Text>
        <Text style={type.label}>{MONTHS[today.getMonth()]} {today.getFullYear()} · paid payments only</Text>
      </View>
      {!d ? <LoadingState rows={4} /> : d.s.allTimeCount === 0 && d.s.pendingCount === 0 ? (
        <GlassCard><EmptyState icon="pie-chart-outline" title="No spending recorded yet" message="Analytics appear as soon as your first payment is confirmed." cta="+ Pay" onCta={() => router.push('/pay')} /></GlassCard>
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <AnalyticsCard label="Total this month" value={formatINR(d.s.monthPaise)} icon="wallet-outline" sub={`${d.s.monthCount} payments`} />
              <AnalyticsCard label="This week" value={formatINR(d.s.weekPaise)} icon="calendar-outline" tint={colors.cyan} sub={`${d.s.weekCount} payments`} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <AnalyticsCard label="Average payment" value={formatINR(d.s.monthAveragePaise)} icon="stats-chart-outline" tint={colors.cyan} />
              <AnalyticsCard label="Largest" value={d.s.largest ? formatINR(d.s.largest.amountPaise) : '—'} icon="trending-up-outline" sub={d.s.largest?.payee ?? undefined} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <AnalyticsCard label="Frequency" value={`${(d.s.monthCount / dayOfMonth).toFixed(1)}/day`} icon="pulse-outline" sub="This month" />
              <AnalyticsCard label="Pending" value={String(d.s.pendingCount)} icon="time-outline" tint={colors.warning} sub={d.s.pendingCount ? `${formatINR(d.s.pendingPaise)} unconfirmed` : 'All clear'} />
            </View>
          </Animated.View>

          {/* Financial Separation (Expenses vs Udhaar) */}
          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Icon name="shield-checkmark-outline" size={20} color={colors.primary} />
                <View>
                  <Text style={type.h3}>Financial Separation</Text>
                  <Text style={type.caption}>True Outflow vs Recoverable Udhaar</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/udhaar')} hitSlop={8}>
                <Text style={[type.label, { color: colors.primary }]}>Udhaar →</Text>
              </Pressable>
            </View>

            <View style={{ gap: space.sm, marginTop: space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <View>
                  <Text style={type.bodyStrong}>True Expenses (Month)</Text>
                  <Text style={type.caption}>Counts toward budgets</Text>
                </View>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatINR(d.s.monthPaise)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <View>
                  <Text style={type.bodyStrong}>Money Lent (Lena Hai)</Text>
                  <Text style={type.caption}>Recoverable · Excluded from expenses</Text>
                </View>
                <Text style={[type.bodyStrong, { color: colors.primary }]}>{formatINR(d.udhaar.totalLentPendingPaise)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                <View>
                  <Text style={type.bodyStrong}>Money Borrowed (Dena Hai)</Text>
                  <Text style={type.caption}>Payable · Excluded from income</Text>
                </View>
                <Text style={[type.bodyStrong, { color: colors.warning }]}>{formatINR(d.udhaar.totalBorrowedPendingPaise)}</Text>
              </View>
            </View>
          </GlassCard>

          {/* Payment DNA Card */}
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={type.caption}>Micro-Payments (≤ ₹200)</Text>
                <Text style={type.bodyStrong}>
                  {d.dna.smallPaymentsCount} ({d.dna.totalPaidCount ? Math.round((d.dna.smallPaymentsCount / d.dna.totalPaidCount) * 100) : 0}%)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={type.caption}>Top Payee</Text>
                <Text style={type.bodyStrong}>{d.dna.mostFrequentPayee?.name ?? '—'}</Text>
              </View>
            </View>
          </GlassCard>

          {/* Money Journey Timeline */}
          {d.journey.length > 0 && (
            <GlassCard padding={space.lg}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
                <Icon name="trail-sign-outline" size={20} color={colors.primary} />
                <View>
                  <Text style={type.h3}>Money Journey</Text>
                  <Text style={type.caption}>Chronological spending replay</Text>
                </View>
              </View>

              <View style={{ gap: space.md, marginTop: space.xs }}>
                {d.journey.slice(-8).reverse().map((step) => (
                  <View key={step.id} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={type.bodyStrong} numberOfLines={1}>{step.payeeName}</Text>
                        <Text style={[type.bodyStrong, { color: colors.text }]}>{formatINR(step.amountPaise)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[type.caption, { color: colors.textMuted }]}>{step.reason} · {step.category}</Text>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>Day total: {formatINR(step.cumulativeDayPaise)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </GlassCard>
          )}

          {d.insights.length ? (
            <GlassCard variant="hero" padding={space.xl}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
                <Icon name="sparkles" size={18} color={colors.primary} />
                <Text style={type.h3}>Insights</Text>
              </View>
              {d.insights.map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: space.sm, paddingVertical: 6 }}>
                  <Text style={{ color: colors.primary }}>•</Text>
                  <Text style={[type.body, { flex: 1 }]}>{t}</Text>
                </View>
              ))}
            </GlassCard>
          ) : null}

          <ChartCard title="Category breakdown" subtitle="This month · tap to focus">
            {d.s.categories.length ? (
              <DonutChart centerLabel="This month" data={d.s.categories.map((c) => ({ label: c.category, value: c.amountPaise, color: colorOf(c.category) }))} />
            ) : <Text style={type.caption}>No paid payments this month yet.</Text>}
          </ChartCard>

          <ChartCard title="Daily spending" subtitle="Last 14 days · tap a bar">
            <BarChart data={d.s.daily.map((x, i) => {
              const dt = new Date(`${x.day}T00:00:00`);
              return { label: `${dt.getDate()} ${MONTHS[dt.getMonth()]}`, value: x.amountPaise, highlight: i === d.s.daily.length - 1 };
            })} />
          </ChartCard>

          <ChartCard title="Monthly trend" subtitle="Last 6 months">
            <LineChart data={d.s.monthly.map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1]!, value: m.amountPaise }))} />
          </ChartCard>

          <ChartCard title="Top payees" subtitle="This month">
            {d.s.topPayees.length ? d.s.topPayees.map((p, i) => (
              <View key={p.payee} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
                <Text style={[type.caption, { width: 16 }]}>{i + 1}</Text>
                <Avatar name={p.payee} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{p.payee}</Text>
                  <Text style={type.caption}>{p.count} payment{p.count === 1 ? '' : 's'}</Text>
                </View>
                <Text style={type.money}>{formatINR(p.amountPaise)}</Text>
              </View>
            )) : <Text style={type.caption}>No payees yet this month.</Text>}
          </ChartCard>
          <Text style={[type.caption, { textAlign: 'center' }]}>All-time recorded: {formatINR(d.s.allTimePaise)} across {d.s.allTimeCount} paid payments (last 6 months shown).</Text>
        </>
      )}
    </Screen>
  );
}
