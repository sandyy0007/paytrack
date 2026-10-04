import { formatINR } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Avatar } from '@/components/PayeeCard';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtRelative } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { cancelPendingReminder } from '@/lib/notifications';
import { ensureReturned, run } from '@/lib/payActions';
import { getExpense, saveSuccessfulPayment, transition } from '@/lib/repo';
import { colors, space, type } from '@/theme/tokens';

export default function Return() {
  const { id, hint, ref, resumed, manual } = useLocalSearchParams<{ id: string; hint?: string; ref?: string; resumed?: string; manual?: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const [busy, setBusy] = useState<'yes' | 'no' | 'later' | null>(null);
  const e = q.data;

  if (q.loading && !e) return <Screen><LoadingState rows={2} /></Screen>;
  if (!e) return <Screen back title="Payment"><ErrorState title="Payment not found" onRetry={() => router.replace('/home')} /></Screen>;
  const answerable = ['PAYMENT_APP_OPENED', 'USER_RETURNED', 'UNCONFIRMED'].includes(e.status);

  const yes = async () => {
    setBusy('yes');
    try {
      await ensureReturned(e.id);
      void cancelPendingReminder(e.id);
      void haptic.success();
      // Auto-save successful payment without forcing manual UTR entry
      await run(() => saveSuccessfulPayment(e.id, ref ? { status: 'SUCCESS', txnRef: ref } : { status: 'SUCCESS' }));
      router.replace({ pathname: '/pay/success', params: { id: e.id } });
    } finally {
      setBusy(null);
    }
  };
  const no = async () => {
    setBusy('no');
    try {
      await ensureReturned(e.id);
      void cancelPendingReminder(e.id);
      router.replace({ pathname: '/pay/failure', params: { id: e.id } });
    } finally {
      setBusy(null);
    }
  };
  const later = async () => {
    setBusy('later');
    try {
      if (e.status !== 'UNCONFIRMED') {
        await ensureReturned(e.id);
        await run(() => transition(e.id, 'UNCONFIRMED', { meta: { reason: 'user_deferred' } }));
      }
      router.replace('/home');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen back={() => router.replace('/home')} title="Confirm payment" footer={answerable ? (
      <>
        <PrimaryButton label="YES, PAYMENT DONE" icon="checkmark-circle" onPress={yes} loading={busy === 'yes'} disabled={!!busy} />
        <SecondaryButton label="PAYMENT FAILED / CANCELLED" icon="close-circle-outline" variant="danger" onPress={no} loading={busy === 'no'} disabled={!!busy} />
        <SecondaryButton label="I'm not sure yet — decide later" variant="ghost" size="md" onPress={later} loading={busy === 'later'} disabled={!!busy} />
      </>
    ) : (
      <PrimaryButton label="View expense" onPress={() => router.replace({ pathname: '/activity/[id]', params: { id: e.id } })} />
    )}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space.sm, marginTop: space.md }}>
        <Text style={type.h1} accessibilityRole="header">Did you complete this payment?</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          {resumed ? 'Welcome back — it looks like PayTrack closed while you were paying. ' : ''}
          Opening a UPI app doesn't mean the payment went through, so please confirm.
        </Text>
      </Animated.View>

      {hint === 'SUCCESS' ? <InlineNotice tone="success" icon="information-circle-outline" text="Your UPI app reported this payment as successful. Please confirm what you saw." /> : null}
      {hint === 'FAILURE' ? <InlineNotice tone="warning" icon="information-circle-outline" text="Your UPI app reported this payment as failed. Please confirm what you saw." /> : null}
      {hint === 'SUBMITTED' ? <InlineNotice icon="information-circle-outline" text="Your UPI app reported this payment as pending with the bank. Check the status there before confirming." /> : null}

      <GlassCard variant="hero" padding={space.xl}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={e.payeeName} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={type.h3} numberOfLines={1}>{e.payeeName ?? e.upiId}</Text>
            <Text style={type.caption} numberOfLines={1}>{e.upiId}</Text>
          </View>
        </View>
        <View style={{ marginTop: space.lg }}><AmountDisplay paise={e.amountPaise} size="lg" /></View>
        <Text style={[type.label, { marginTop: space.xs }]}>{e.reason} · {e.category}</Text>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <StatusBadge status={e.status} compact />
          <Text style={type.caption}>{fmtRelative(e.createdAt)} · {e.expenseCode}</Text>
        </View>
      </GlassCard>
      {!answerable ? <InlineNotice text={`This payment is already ${e.status === 'PAID' ? 'recorded as paid' : 'resolved'} (${formatINR(e.amountPaise)}).`} /> : null}
    </Screen>
  );
}
