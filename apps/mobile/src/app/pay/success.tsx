import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { LoadingState } from '@/components/States';
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
        <Animated.Text entering={FadeInDown.delay(300)} style={[type.h1, { marginTop: -space.lg }]} accessibilityRole="header">Payment Recorded</Animated.Text>
        <Animated.View entering={FadeInDown.delay(380)} style={{ marginTop: space.md }}>
          <AmountDisplay paise={e.amountPaise} size="lg" />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(460)}>
        <GlassCard padding={space.xl}>
          <Row k="Paid to" v={e.payeeName ?? e.upiId ?? '—'} />
          <Row k="For" v={e.reason} />
          <Row k="UTR" v={e.utr ?? e.transactionReference ?? '—'} />
          <Row k="Date" v={fmtDate(when)} />
          <Row k="Time" v={fmtTime(when)} />
        </GlassCard>
      </Animated.View>
      <Text style={[type.caption, { textAlign: 'center', color: colors.textMuted }]}>Recorded from your confirmation and reference. Your analytics are updated.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm },
});
