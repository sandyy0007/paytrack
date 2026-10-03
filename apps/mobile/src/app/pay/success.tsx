import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { SuccessCheck } from '@/components/SuccessCheck';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate, fmtTime } from '@/lib/format';
import { checkBudgetAlerts } from '@/lib/notifications';
import { usePayFlow } from '@/lib/payFlow';
import { getExpense } from '@/lib/repo';
import { colors, space, type } from '@/theme/tokens';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={type.label}>{k}</Text>
      <Text style={[type.bodyStrong, { flexShrink: 1, textAlign: 'right' }]} selectable>{v}</Text>
    </View>
  );
}

export default function Success() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const reset = usePayFlow((s) => s.reset);
  useEffect(() => {
    reset();
    void checkBudgetAlerts();
  }, [reset]);
  const e = q.data;
  if (!e) return <Screen><LoadingState rows={2} /></Screen>;
  const when = e.paymentCompletedAt ?? e.updatedAt;
  return (
    <Screen footer={
      <>
        <PrimaryButton label="DONE" onPress={() => router.replace('/home')} />
        <SecondaryButton label="VIEW EXPENSE" size="md" onPress={() => router.replace({ pathname: '/activity/[id]', params: { id: e.id } })} />
      </>
    }>
      <View style={{ alignItems: 'center', marginTop: space.lg }}>
        <SuccessCheck />
        <Animated.Text entering={FadeInDown.delay(300)} style={[type.h1, { marginTop: -space.lg }]} accessibilityRole="header">
          Payment Successful
        </Animated.Text>
        <Animated.View entering={FadeInDown.delay(380)} style={{ marginTop: space.md }}>
          <AmountDisplay paise={e.amountPaise} size="lg" />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(460)} style={{ marginTop: space.md }}>
        <GlassCard padding={space.xl}>
          <View style={styles.badgeRow}>
            <Text style={type.label}>Status</Text>
            <StatusBadge status={e.status} />
          </View>
          <Row k="Payee Name" v={e.payeeName ?? '—'} />
          <Row k="Payee UPI ID" v={e.upiId ?? '—'} />
          <Row k="Purpose / Category" v={`${e.reason} (${e.category})`} />
          {e.transactionId ? <Row k="Transaction ID" v={e.transactionId} /> : null}
          <Row k="UTR / Ref" v={e.utr ?? e.approvalReference ?? e.transactionReference ?? '—'} />
          <Row k="Expense ID" v={e.expenseCode} />
          <Row k="Date" v={fmtDate(when)} />
          <Row k="Time" v={fmtTime(when)} />
        </GlassCard>
      </Animated.View>
      <Text style={[type.caption, { textAlign: 'center', color: colors.textMuted, marginTop: space.sm }]}>
        Payment recorded and verified. Your analytics are up to date.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm },
});
