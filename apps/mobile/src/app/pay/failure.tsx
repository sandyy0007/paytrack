import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { LoadingState } from '@/components/States';
import { SuccessCheck } from '@/components/SuccessCheck';
import { useLiveQuery } from '@/lib/dataVersion';
import { run } from '@/lib/payActions';
import { getExpense, transition } from '@/lib/repo';
import { colors, space, type } from '@/theme/tokens';

export default function Failure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const e = q.data;
  if (!e) return <Screen><LoadingState rows={2} /></Screen>;

  const act = async (kind: 'failed' | 'cancel') => {
    setBusy(kind);
    try {
      await run(() => transition(e.id, kind === 'failed' ? 'FAILED' : 'CANCELLED'));
      router.replace('/home');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen footer={
      <>
        <PrimaryButton label="TRY AGAIN" icon="refresh" onPress={() => router.replace({ pathname: '/pay/redirect', params: { id: e.id } })} disabled={!!busy} />
        <SecondaryButton label="SAVE AS FAILED" size="md" onPress={() => act('failed')} loading={busy === 'failed'} disabled={!!busy} />
        <SecondaryButton label="CANCEL" size="md" variant="ghost" onPress={() => act('cancel')} loading={busy === 'cancel'} disabled={!!busy} />
      </>
    }>
      <View style={{ alignItems: 'center', marginTop: space.xl, gap: space.sm }}>
        <SuccessCheck tone="error" size={100} />
        <Text style={[type.h1, { textAlign: 'center' }]} accessibilityRole="header">Payment wasn't completed.</Text>
        <AmountDisplay paise={e.amountPaise} size="md" color={colors.textSecondary} />
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          To {e.payeeName ?? e.upiId} · {e.reason}. This will not be counted as spending.
        </Text>
        <Text style={[type.caption, { textAlign: 'center', marginTop: space.md }]}>If money was debited, check your UPI app — failed payments are usually reversed by your bank.</Text>
      </View>
    </Screen>
  );
}
