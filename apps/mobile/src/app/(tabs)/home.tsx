import { EXPENSE_MODES, formatINR, summarize } from '@paytrack/shared';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDateLong, greeting, tzOffsetMinutes, weekdayLong } from '@/lib/format';
import { dismissRecovery, expensesSince, findOpenPaymentSessions, listAttention, listExpenses } from '@/lib/repo';
import { attentionLabel, resumeHref } from '@/lib/routes';
import { useSession } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { colors, elevation, fonts, radius, space, type } from '@/theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { SpendingSphere } from '@/components/SpendingSphere';

function QuickAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <ScalePressable onPress={onPress} hapticStyle={primary ? 'press' : 'tap'} accessibilityRole="button" accessibilityLabel={label} style={[styles.qa, primary && elevation.glow]}>
      {primary ? <LinearGradient colors={['#34F5B4', '#10E39A', '#0BB57A']} style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} /> : null}
      <View style={[styles.qaIcon, primary && { backgroundColor: 'rgba(3,20,13,0.15)' }]}>
        <Icon name={icon} size={22} color={primary ? colors.onPrimary : colors.primary} />
      </View>
      <Text style={[styles.qaLabel, primary && { color: colors.onPrimary }]}>{label}</Text>
    </ScalePressable>
  );
}

export default function Home() {
  const session = useSession((s) => s.session);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string>('All');
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  since.setDate(since.getDate() - 7);

  const stats = useLiveQuery(async () => summarize(await expensesSince(since), new Date(), tzOffsetMinutes()));
  const recent = useLiveQuery(() => listExpenses({ limit: 12 }));
  const attention = useLiveQuery(() => listAttention());
  const openSessions = useLiveQuery(() => findOpenPaymentSessions());

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncNow();
    setRefreshing(false);
  }, []);

  const s = stats.data;
  const name = session?.user.name?.split(' ')[0];
  const att = attention.data ?? [];
  const open = openSessions.data ?? [];

  const displayExpenses = (recent.data ?? []).filter(
    (e) => selectedMode === 'All' || (e.mode ?? 'Personal') === selectedMode,
  );

  return (
    <Screen bottomInset={TAB_CONTENT_INSET} refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.h2} accessibilityRole="header">{greeting(now)}{name && name !== 'there' ? `, ${name}` : ''}</Text>
          <Text style={type.label}>{weekdayLong(now)}, {fmtDateLong(now)}</Text>
        </View>
        <ScalePressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          <Avatar name={session?.user.name === 'there' ? null : session?.user.name} size={44} />
        </ScalePressable>
      </View>

      <Animated.View entering={FadeInDown.duration(450)}>
        <GlassCard variant="hero" padding={space.xxl} style={{ borderRadius: radius.xxl }}>
          <View style={styles.orbWrap} pointerEvents="none">
            <SpendingSphere />
          </View>
          <Text style={type.overline}>Spent this month</Text>
          <View style={{ marginTop: space.sm }}>
            <AmountDisplay paise={s?.monthPaise ?? 0} size="lg" />
          </View>
          <Text style={[type.caption, { marginTop: 4 }]}>{s ? `${s.monthCount} paid payment${s.monthCount === 1 ? '' : 's'}` : ' '}</Text>
          <View style={styles.split}>
            <View style={styles.splitCell}>
              <Text style={type.caption}>This week</Text>
              <Text style={[type.money, { marginTop: 2 }]}>{formatINR(s?.weekPaise ?? 0)}</Text>
            </View>
            <View style={styles.vr} />
            <View style={styles.splitCell}>
              <Text style={type.caption}>Today</Text>
              <Text style={[type.money, { marginTop: 2 }]}>{formatINR(s?.todayPaise ?? 0)}</Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      <View style={styles.qaRow}>
        <QuickAction icon="add" label="+ PAY" primary onPress={() => router.push('/pay')} />
        <QuickAction icon="scan-outline" label="Scan QR" onPress={() => router.push('/pay/scan')} />
        <QuickAction icon="create-outline" label="Add Expense" onPress={() => router.push('/add-expense')} />
      </View>

      <SyncBanner />

      {/* Interrupted Payment Recovery Banner */}
      {open.length > 0 && (
        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassCard padding={space.lg} style={{ borderColor: colors.primary, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }}>
              <Icon name="refresh-circle" size={22} color={colors.primary} />
              <Text style={[type.h3, { color: colors.primary }]}>Payment Recovery</Text>
            </View>
            <Text style={[type.caption, { color: colors.textSecondary, marginBottom: space.sm }]}>
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
                  borderColor: colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={[type.caption, { color: colors.textSecondary }]}>Dismiss</Text>
              </ScalePressable>
            </View>
          </GlassCard>
        </Animated.View>
      )}

      {att.length > 0 && (
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <GlassCard padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Icon name="alert-circle" size={18} color={colors.warning} />
              <Text style={type.h3}>{att.length} payment{att.length === 1 ? ' needs' : 's need'} attention</Text>
            </View>
            {att.slice(0, 3).map((e) => (
              <ScalePressable key={e.id} onPress={() => router.push(resumeHref(e))} accessibilityRole="button" accessibilityLabel={`${formatINR(e.amountPaise)} to ${e.payeeName ?? e.upiId}. ${attentionLabel(e)}`} style={styles.attRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>{formatINR(e.amountPaise)} → {e.payeeName ?? e.upiId}</Text>
                  <Text style={[type.caption, { color: colors.warning }]}>{attentionLabel(e)}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={colors.textMuted} />
              </ScalePressable>
            ))}
            {att.length > 3 ? <Text style={[type.label, { color: colors.primary, marginTop: space.sm }]} onPress={() => router.push({ pathname: '/activity', params: { bucket: 'PENDING' } })}>View all</Text> : null}
          </GlassCard>
        </Animated.View>
      )}

      {/* Mode Filter Selector */}
      <View style={{ marginTop: space.sm }}>
        <SectionHeader title="Recent payments" action={recent.data?.length ? 'See all' : undefined} onAction={() => router.push('/activity')} />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: space.sm }}>
          {['All', ...EXPENSE_MODES].map((m) => {
            const active = selectedMode === m;
            return (
              <ScalePressable
                key={m}
                onPress={() => setSelectedMode(m)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.bgElevated,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={[type.caption, { color: active ? colors.onPrimary : colors.textSecondary, fontWeight: active ? '700' : '400', fontSize: 11 }]}>
                  {m}
                </Text>
              </ScalePressable>
            );
          })}
        </View>
      </View>

      {recent.loading && !recent.data ? (
        <LoadingState rows={3} />
      ) : displayExpenses.length ? (
        <View style={{ gap: space.sm }}>
          {displayExpenses.map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.delay(60 * i).duration(350)}>
              <TransactionCard expense={e} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.id } })} />
            </Animated.View>
          ))}
        </View>
      ) : (
        <GlassCard>
          <EmptyState icon="receipt-outline" title="No expenses in this mode." message="Expenses recorded in this mode will appear here." cta="+ Pay" onCta={() => router.push('/pay')} />
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orbWrap: { position: 'absolute', right: 8, top: 10, width: 96, height: 96 },
  split: { flexDirection: 'row', marginTop: space.xl, padding: space.md, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.25)' },
  splitCell: { flex: 1, paddingHorizontal: space.sm },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  qaRow: { flexDirection: 'row', gap: space.md },
  qa: { flex: 1, height: 92, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  qaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  qaLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  attRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, minHeight: 48 },
});
