import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { InlineNotice, LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { SuccessCheck } from '@/components/SuccessCheck';
import { useLiveQuery } from '@/lib/dataVersion';
import { run } from '@/lib/payActions';
import { getExpense, transition } from '@/lib/repo';
import { colors, space, type } from '@/theme/tokens';

function responseCodeDescription(code?: string | null): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  switch (c) {
    case 'ZA':
    case 'U19':
      return 'Payment cancelled by user.';
    case 'ZM':
    case 'U17':
      return 'PIN limit or security verification failed.';
    case 'XY':
    case 'U30':
      return 'Transaction declined by bank switch.';
    case 'XF':
      return 'Payment declined by receiver bank.';
    case 'ZH':
      return 'UPI daily transaction limit reached.';
    case 'Z9':
      return 'Insufficient account balance.';
    default:
      return `UPI Response Code: ${code}`;
  }
}

export default function Failure() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const e = q.data;
  if (!e) return <Screen><LoadingState rows={2} /></Screen>;

  const errCode = code || e.responseCode;
  const reasonText = responseCodeDescription(errCode);

  const retry = async () => {
    setBusy('retry');
    try {
      if (e.status !== 'PENDING_PAYMENT') {
        await run(() => transition(e.id, 'PENDING_PAYMENT'));
      }
      router.replace({ pathname: '/pay/redirect', params: { id: e.id } });
    } finally {
      setBusy(null);
    }
  };

  const act = async (kind: 'failed' | 'cancel') => {
    setBusy(kind);
    try {
      if (kind === 'failed' && e.status !== 'FAILED') {
        await run(() => transition(e.id, 'FAILED'));
      } else if (kind === 'cancel' && e.status !== 'CANCELLED') {
        await run(() => transition(e.id, 'CANCELLED'));
      }
      router.replace('/home');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={
      <>
        <PrimaryButton label="TRY AGAIN" icon="refresh" onPress={retry} loading={busy === 'retry'} disabled={!!busy} />
        <SecondaryButton label="SAVE AS FAILED" size="md" onPress={() => act('failed')} loading={busy === 'failed'} disabled={!!busy} />
        <SecondaryButton label="CANCEL" size="md" variant="ghost" onPress={() => act('cancel')} loading={busy === 'cancel'} disabled={!!busy} />
      </>
    }>
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: space.sm }}>
        <SuccessCheck tone="error" size={100} />
        <Text style={[type.h1, { textAlign: 'center' }]} accessibilityRole="header">Payment Not Completed</Text>
        <AmountDisplay paise={e.amountPaise} size="md" color={colors.textSecondary} />
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          To {e.payeeName ?? e.upiId} · {e.reason}. This will not be counted as spending.
        </Text>
      </View>

      {reasonText ? (
        <View style={{ marginTop: space.lg }}>
          <InlineNotice tone="error" icon="alert-circle-outline" text={reasonText} />
        </View>
      ) : null}

      <View style={{ marginTop: space.md }}>
        <GlassCard padding={space.lg}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.label}>Status</Text>
            <StatusBadge status={e.status} />
          </View>
          {e.transactionId ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
              <Text style={type.label}>Transaction ID</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>{e.transactionId}</Text>
            </View>
          ) : null}
        </GlassCard>
      </View>

      <Text style={[type.caption, { textAlign: 'center', marginTop: space.lg, color: colors.textMuted }]}>
        If money was debited, check your UPI app — failed transactions are automatically refunded by the banking system.
      </Text>
    </Screen>
  );
}
