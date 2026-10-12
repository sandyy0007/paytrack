import { formatINR, summarize } from '@paytrack/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AmountDisplay } from '@/components/AmountDisplay';
import { GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { Avatar } from '@/components/PayeeCard';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { EmptyState, LoadingState, SectionHeader } from '@/components/States';
import { SyncBanner } from '@/components/SyncBanner';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { TransactionCard } from '@/components/TransactionCard';
import { SpendingSphere } from '@/components/SpendingSphere';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDateLong, greeting, tzOffsetMinutes, weekdayLong } from '@/lib/format';
import {
  dismissRecovery,
  expensesSince,
  findOpenPaymentSessions,
  getMoneyPosition,
  getUdhaarSummary,
  listAttention,
  listBudgets,
  listExpenses,
} from '@/lib/repo';
import { attentionLabel, resumeHref } from '@/lib/routes';
import { useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { colors, elevation, fonts, radius, space, type, useThemeColors } from '@/theme/tokens';

function QuickAction({
  icon,
  label,
  onPress,
  primary,
  flex = 1,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  flex?: number;
}) {
  return (
    <ScalePressable
      onPress={onPress}
      hapticStyle={primary ? 'press' : 'tap'}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.qa,
        { flex },
        primary && elevation.glow,
        primary && { borderColor: 'transparent' },
      ]}
    >
      {primary ? (
        <LinearGradient
          colors={['#34F5B4', '#10E39A', '#0BB57A']}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
        />
      ) : null}
      <View style={[styles.qaIcon, primary && { backgroundColor: 'rgba(3,20,13,0.18)' }]}>
        <Icon name={icon} size={22} color={primary ? colors.onPrimary : colors.primary} />
      </View>
      <Text style={[styles.qaLabel, primary && { color: colors.onPrimary, fontWeight: '700' }]}>
        {label}
      </Text>
    </ScalePressable>
  );
}

export default function Home() {
  const session = useSession((s) => s.session);
  const c = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  since.setDate(since.getDate() - 7);

  const stats = useLiveQuery(async () => summarize(await expensesSince(since), new Date(), tzOffsetMinutes()));
  const recent = useLiveQuery(() => listExpenses({ limit: 1 }));
  const attention = useLiveQuery(() => listAttention());
  const openSessions = useLiveQuery(() => findOpenPaymentSessions());
  const moneyPositionQuery = useLiveQuery(() => getMoneyPosition());
  const udhaarSummaryQuery = useLiveQuery(() => getUdhaarSummary());
  const budgetsQuery = useLiveQuery(() => listBudgets());

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    setRefreshing(false);
  }, []);

  const s = stats.data;
  const name = session?.user.name?.split(' ')[0];
  const att = attention.data ?? [];
  const open = openSessions.data ?? [];
  const moneyPos = moneyPositionQuery.data;
  const udhaarSum = udhaarSummaryQuery.data;
  const latestExpense = recent.data?.[0];

  // Budget calculations
  const monthlyBudgets = (budgetsQuery.data ?? []).filter((b) => b.period === 'MONTHLY');
  const totalMonthlyBudgetPaise = monthlyBudgets.reduce((sum, b) => sum + b.amountPaise, 0);
  const spentPaise = s?.monthPaise ?? 0;
  const remainingPaise = Math.max(0, totalMonthlyBudgetPaise - spentPaise);
  const budgetUsedPct =
    totalMonthlyBudgetPaise > 0
      ? Math.min(100, Math.round((spentPaise / totalMonthlyBudgetPaise) * 100))
      : 0;

  const budgetBarColor =
    budgetUsedPct >= 100
      ? colors.error
      : budgetUsedPct >= 80
      ? colors.warning
      : colors.primary;

  return (
    <Screen bottomInset={TAB_CONTENT_INSET} refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.h2} accessibilityRole="header">
            {greeting(now)}{name && name !== 'there' ? `, ${name}` : ''}
          </Text>
          <Text style={[type.label, { color: c.textSecondary }]}>
            {weekdayLong(now)}, {fmtDateLong(now)}
          </Text>
        </View>
        <ScalePressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Avatar name={session?.user.name === 'there' ? null : session?.user.name} size={44} />
        </ScalePressable>
      </View>

      {/* Hero: Spent this month */}
      <Animated.View entering={FadeInDown.duration(450)}>
        <GlassCard variant="hero" padding={space.xxl} style={{ borderRadius: radius.xxl }}>
          <View style={styles.orbWrap} pointerEvents="none">
            <SpendingSphere />
          </View>
          <Text style={type.overline}>Spent this month</Text>
          <View style={{ marginTop: space.sm }}>
            <AmountDisplay paise={spentPaise} size="lg" />
          </View>
          <Text style={[type.caption, { color: c.textMuted, marginTop: 4 }]}>
            {s ? `${s.monthCount} completed payment${s.monthCount === 1 ? '' : 's'}` : ' '}
          </Text>
          <View style={styles.split}>
            <View style={styles.splitCell}>
              <Text style={[type.caption, { color: c.textMuted }]}>This week</Text>
              <Text style={[type.money, { color: c.text, marginTop: 2 }]}>{formatINR(s?.weekPaise ?? 0)}</Text>
            </View>
            <View style={styles.vr} />
            <View style={styles.splitCell}>
              <Text style={[type.caption, { color: c.textMuted }]}>Today</Text>
              <Text style={[type.money, { color: c.text, marginTop: 2 }]}>{formatINR(s?.todayPaise ?? 0)}</Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* Unified Action System: Primary +PAY CTA leads with supporting actions */}
      <View style={styles.qaRow}>
        <QuickAction
          icon="add"
          label="+ PAY"
          primary
          flex={1.4}
          onPress={() => router.push('/pay')}
        />
        <QuickAction
          icon="create-outline"
          label="Add Expense"
          flex={1}
          onPress={() => router.push('/add-expense')}
        />
        <QuickAction
          icon="people-outline"
          label="Udhaar"
          flex={1}
          onPress={() => router.push('/udhaar')}
        />
      </View>

      <SyncBanner />

      {/* Actionable Monthly Budget Card */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <GlassCard
          padding={space.lg}
          onPress={() => router.push('/budgets')}
          accessibilityLabel="Monthly Budget Status. Tap to view or adjust budgets."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Icon name="wallet-outline" size={18} color={colors.primary} />
              <Text style={[type.h3, { color: c.text }]}>Monthly Budget</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[type.caption, { color: colors.primary, fontWeight: '600' }]}>
                {totalMonthlyBudgetPaise > 0 ? 'Adjust' : 'Set Budget'}
              </Text>
              <Icon name="chevron-forward" size={14} color={colors.primary} />
            </View>
          </View>

          {totalMonthlyBudgetPaise > 0 ? (
            <View style={{ marginTop: space.md, gap: space.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Text style={[type.caption, { color: c.textMuted }]}>Remaining</Text>
                  <Text style={[type.h2, { color: remainingPaise > 0 ? colors.primary : colors.error, marginTop: 2 }]}>
                    {formatINR(remainingPaise)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.caption, { color: c.textMuted }]}>
                    Limit: {formatINR(totalMonthlyBudgetPaise)}
                  </Text>
                  <Text style={[type.caption, { color: c.textSecondary, marginTop: 2 }]}>
                    {budgetUsedPct}% used
                  </Text>
                </View>
              </View>

              {/* Progress Track */}
              <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${budgetUsedPct}%`,
                      backgroundColor: budgetBarColor,
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: space.sm }}>
              <Text style={[type.caption, { color: c.textMuted }]}>
                Track your monthly spending against a financial target. Tap to configure.
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      {/* Available Usable Money Card (when configured) */}
      {moneyPos && moneyPos.bankBalancePaise > 0 ? (
        <Animated.View entering={FadeInDown.duration(350)}>
          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={[type.caption, { color: c.textMuted }]}>Available Money (Position)</Text>
                <Text style={[type.h2, { color: colors.cyan, marginTop: 2 }]}>
                  {formatINR(moneyPos.usableBalancePaise)}
                </Text>
              </View>
              <Icon name="cash-outline" size={24} color={colors.cyan} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
              <Text style={[type.caption, { color: c.textMuted }]}>
                Bank: {formatINR(moneyPos.bankBalancePaise)}
              </Text>
              {moneyPos.receivablePaise > 0 ? (
                <Text style={[type.caption, { color: colors.primary }]}>
                  Receivable: +{formatINR(moneyPos.receivablePaise)}
                </Text>
              ) : null}
              {moneyPos.payablePaise > 0 ? (
                <Text style={[type.caption, { color: colors.warning }]}>
                  Payable: -{formatINR(moneyPos.payablePaise)}
                </Text>
              ) : null}
            </View>
          </GlassCard>
        </Animated.View>
      ) : null}

      {/* Compact Udhaar Summary Card */}
      <Animated.View entering={FadeInDown.duration(350)}>
        <GlassCard
          padding={space.lg}
          onPress={() => router.push('/udhaar')}
          accessibilityLabel="Udhaar lent and borrowed summary. Tap to open"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Icon name="people-outline" size={18} color={colors.primary} />
              <Text style={[type.h3, { color: c.text }]}>Udhaar (Lend & Borrow)</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={c.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.xs }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: c.textMuted }]}>Receivable (To Receive)</Text>
              <Text style={[type.h3, { color: colors.primary, marginTop: 2 }]}>
                {udhaarSum ? formatINR(udhaarSum.totalLentPendingPaise) : '₹0'}
              </Text>
              <Text style={[type.caption, { color: c.textMuted }]}>
                {udhaarSum ? `${udhaarSum.activeLentCount} active` : ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: c.textMuted }]}>Payable (To Pay)</Text>
              <Text style={[type.h3, { color: colors.warning, marginTop: 2 }]}>
                {udhaarSum ? formatINR(udhaarSum.totalBorrowedPendingPaise) : '₹0'}
              </Text>
              <Text style={[type.caption, { color: c.textMuted }]}>
                {udhaarSum ? `${udhaarSum.activeBorrowedCount} active` : ''}
              </Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* Interrupted Payment Recovery Banner */}
      {open.length > 0 && (
        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassCard padding={space.lg} style={{ borderColor: colors.primary, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
              <Icon name="refresh-circle" size={22} color={colors.primary} />
              <Text style={[type.h3, { color: colors.primary }]}>Payment Recovery</Text>
            </View>
            <Text style={[type.caption, { color: c.textSecondary, marginBottom: space.sm }]}>
              An interrupted payment of {formatINR(open[0].amountPaise)} to {open[0].payeeName ?? open[0].upiId} was detected.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
              <ScalePressable
                onPress={() => router.push(resumeHref(open[0]))}
                style={{
                  flex: 1,
                  backgroundColor: colors.primary,
                  paddingVertical: 10,
                  borderRadius: radius.md,
                  alignItems: 'center',
                }}
              >
                <Text style={[type.caption, { color: colors.onPrimary, fontWeight: '700' }]}>Review / Complete</Text>
              </ScalePressable>
              <ScalePressable
                onPress={() => dismissRecovery(open[0].id)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: space.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: 'center',
                }}
              >
                <Text style={[type.caption, { color: c.textSecondary }]}>Dismiss</Text>
              </ScalePressable>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {/* Attention Required Banner */}
      {att.length > 0 && (
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Icon name="alert-circle" size={18} color={colors.warning} />
              <Text style={[type.h3, { color: c.text }]}>
                {att.length} payment{att.length === 1 ? ' needs' : 's need'} attention
              </Text>
            </View>
            {att.slice(0, 3).map((e) => (
              <ScalePressable
                key={e.id}
                onPress={() => router.push(resumeHref(e))}
                accessibilityRole="button"
                accessibilityLabel={`${formatINR(e.amountPaise)} to ${e.payeeName ?? e.upiId}. ${attentionLabel(e)}`}
                style={styles.attRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                    {formatINR(e.amountPaise)} → {e.payeeName ?? e.upiId}
                  </Text>
                  <Text style={[type.caption, { color: colors.warning }]}>{attentionLabel(e)}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={c.textMuted} />
              </ScalePressable>
            ))}
            {att.length > 3 ? (
              <Text
                style={[type.label, { color: colors.primary, marginTop: space.sm }]}
                onPress={() => router.push({ pathname: '/activity', params: { bucket: 'PENDING' } })}
              >
                View all pending
              </Text>
            ) : null}
          </GlassCard>
        </Animated.View>
      )}

      {/* Compact Latest Payment Preview + Direct Link to Activity */}
      <View style={{ marginTop: space.xs }}>
        <SectionHeader
          title="Recent activity"
          action="See all"
          onAction={() => router.push('/activity')}
        />

        {recent.loading && !recent.data ? (
          <LoadingState rows={1} />
        ) : latestExpense ? (
          <Animated.View entering={FadeInDown.duration(350)}>
            <TransactionCard
              expense={latestExpense}
              onPress={() => router.push({ pathname: '/activity/[id]', params: { id: latestExpense.id } })}
            />
          </Animated.View>
        ) : (
          <GlassCard>
            <EmptyState
              icon="receipt-outline"
              title="No payments yet"
              message="Payments made or recorded will appear in your Activity."
              cta="+ Pay"
              onCta={() => router.push('/pay')}
            />
          </GlassCard>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orbWrap: { position: 'absolute', right: 8, top: 10, width: 96, height: 96 },
  split: {
    flexDirection: 'row',
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  splitCell: { flex: 1, paddingHorizontal: space.sm },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  qaRow: { flexDirection: 'row', gap: space.sm },
  qa: {
    height: 80,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  qaIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  qaLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    minHeight: 48,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
});
