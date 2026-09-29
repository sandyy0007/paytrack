import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Icon } from '@/components/Icon';
import { ConfirmDialog } from '@/components/Overlays';
import { PaymentSlip } from '@/components/PaymentSlip';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/States';
import { UpiAppPicker } from '@/components/UpiAppPicker';
import { useLiveQuery } from '@/lib/dataVersion';
import { run } from '@/lib/payActions';
import { getExpense, transition } from '@/lib/repo';
import { resumeHref } from '@/lib/routes';
import { useSettings } from '@/lib/settings';
import { appNameForPackage } from '@/lib/upiLaunch';
import { colors, radius, space, type } from '@/theme/tokens';

export default function Slip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const pkg = useSettings((s) => s.preferredUpiPackage);
  const [picker, setPicker] = useState(false);
  const [cancel, setCancel] = useState(false);
  const e = q.data;

  if (q.loading && !e) return <Screen title="Payment slip"><LoadingState rows={2} /></Screen>;
  if (!e) return <Screen back title="Payment slip"><ErrorState title="Slip not found" message="This expense may have been deleted." onRetry={() => router.replace('/home')} /></Screen>;
  const canPay = e.status === 'PENDING_PAYMENT';

  return (
    <Screen
      back={() => router.replace('/home')}
      title="Payment slip"
      footer={canPay ? (
        <>
          <ScalePressable onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel={`Pay with ${appNameForPackage(pkg) ?? 'any UPI app'}. Change`}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, borderRadius: radius.pill }}>
            <Icon name="swap-horizontal" size={14} color={colors.textSecondary} />
            <Text style={type.label}>Pay with: <Text style={{ color: colors.text }}>{appNameForPackage(pkg) ?? 'Choose UPI app'}</Text></Text>
          </ScalePressable>
          <PrimaryButton label="PAY NOW" icon="flash" onPress={() => router.replace({ pathname: '/pay/redirect', params: { id: e.id } })} accessibilityHint="Opens your UPI app with these payment details" />
          <SecondaryButton label="Cancel payment" variant="ghost" size="md" onPress={() => setCancel(true)} />
        </>
      ) : (
        <PrimaryButton label="Continue" onPress={() => router.replace(resumeHref(e))} />
      )}
    >
      <View style={{ marginTop: space.sm }}>
        <PaymentSlip data={e} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingHorizontal: space.xs }}>
        <Icon name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
        <Text style={[type.caption, { flex: 1, color: colors.textSecondary }]}>
          Saved on your device. You'll complete the payment and enter your UPI PIN only inside your UPI app — PayTrack never asks for it.
        </Text>
      </View>
      <UpiAppPicker visible={picker} onClose={() => setPicker(false)} />
      <ConfirmDialog
        visible={cancel}
        title="Cancel this payment?"
        message="The slip will be kept in your activity as Cancelled. No money has been sent from PayTrack."
        confirmLabel="Cancel payment"
        cancelLabel="Keep"
        destructive
        onCancel={() => setCancel(false)}
        onConfirm={async () => { setCancel(false); await run(() => transition(e.id, 'CANCELLED')); router.replace('/home'); }}
      />
    </Screen>
  );
}
