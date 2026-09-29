import { formatINR } from '@paytrack/shared';
import { Redirect, router } from 'expo-router';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { PayeeCard } from '@/components/PayeeCard';
import { Screen } from '@/components/Screen';
import { usePayFlow } from '@/lib/payFlow';
import { colors, space, type } from '@/theme/tokens';

export default function Payee() {
  const { payload, amountPaise, qrSource } = usePayFlow();
  if (!payload) return <Redirect href="/pay" />;
  const hasAmount = payload.amountPaise != null;

  return (
    <Screen back title="Payee Found" footer={
      <>
        <PrimaryButton label="Continue" icon="arrow-forward" onPress={() => router.push(hasAmount ? '/pay/purpose' : '/pay/amount')} />
        {hasAmount && !payload.amountLocked ? <SecondaryButton label="Change amount" variant="ghost" size="md" onPress={() => router.push('/pay/amount')} /> : null}
      </>
    }>
      <Animated.View entering={ZoomIn.springify().damping(16)} style={{ alignItems: 'center', marginTop: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={qrSource === 'MANUAL_UPI' ? 'at' : 'qr-code'} size={16} color={colors.primary} />
          <Text style={[type.overline, { color: colors.primary }]}>{qrSource === 'MANUAL_UPI' ? 'UPI ID entered' : 'QR read successfully'}</Text>
        </View>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(60).duration(400)}>
        <PayeeCard name={payload.pn} upiId={payload.pa} merchant={payload.isMerchant} manual={qrSource === 'MANUAL_UPI'} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(140).duration(400)}>
        <GlassCard padding={space.xl}>
          <Text style={type.overline}>Amount</Text>
          {hasAmount ? (
            <View style={{ marginTop: space.sm, gap: space.xs }}>
              <AmountDisplay paise={amountPaise ?? payload.amountPaise!} size="md" />
              <Text style={type.caption}>
                {payload.amountLocked ? 'Fixed amount set by this merchant QR' : `From QR${amountPaise != null && amountPaise !== payload.amountPaise ? ` (was ${formatINR(payload.amountPaise!)})` : ''}`}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
              <Icon name="keypad-outline" size={18} color={colors.warning} />
              <Text style={[type.bodyStrong, { color: colors.warning }]}>Amount required</Text>
            </View>
          )}
          {payload.note ? <Text style={[type.caption, { marginTop: space.md }]}>Note in QR: {payload.note}</Text> : null}
        </GlassCard>
      </Animated.View>
    </Screen>
  );
}
