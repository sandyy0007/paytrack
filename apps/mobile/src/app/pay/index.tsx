import { useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { ManualUpiSheet } from '@/components/ManualUpiSheet';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { usePayFlow } from '@/lib/payFlow';
import { colors, radius, space, type } from '@/theme/tokens';

export default function CreatePayment() {
  const [perm, requestPerm] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const reset = usePayFlow((s) => s.reset);

  const scan = async () => {
    reset();
    if (perm?.granted) return router.push('/pay/scan');
    const r = await requestPerm();
    if (r.granted) router.push('/pay/scan');
  };

  return (
    <Screen back title="Create Payment" footer={
      <>
        <PrimaryButton label="Scan QR" icon="scan" onPress={scan} accessibilityHint="Opens the camera to scan a UPI QR code" />
        <SecondaryButton label="Enter UPI ID instead" icon="at" variant="ghost" onPress={() => { reset(); setManual(true); }} size="md" />
      </>
    }>
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space.sm, marginTop: space.lg }}>
        <Text style={type.h1} accessibilityRole="header">Every payment starts with a purpose.</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>Scan the recipient's UPI QR. We'll prepare the payment and your expense record together.</Text>
      </Animated.View>
      <GlassCard variant="hero" padding={space.xl}>
        {[
          { icon: 'scan-outline' as const, t: 'Scan QR', d: 'UPI ID & payee name are read from the QR' },
          { icon: 'chatbubble-ellipses-outline' as const, t: 'Add purpose', d: 'What is this payment for?' },
          { icon: 'open-outline' as const, t: 'Pay in your UPI app', d: 'Google Pay, PhonePe, Paytm, BHIM…' },
          { icon: 'checkmark-done-outline' as const, t: 'Confirm & track', d: 'Add the UTR — your expense is recorded' },
        ].map((s, i) => (
          <View key={s.t} style={[styles.step, i > 0 && styles.stepBorder]}>
            <View style={styles.stepIcon}><Icon name={s.icon} size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{s.t}</Text>
              <Text style={type.caption}>{s.d}</Text>
            </View>
          </View>
        ))}
      </GlassCard>
      {perm && !perm.granted && !perm.canAskAgain ? (
        <View style={{ gap: space.sm }}>
          <InlineNotice tone="warning" icon="camera-outline" text="Camera access is off. It's used only to scan UPI QR codes for payment preparation." />
          <SecondaryButton label="Open settings" icon="settings-outline" size="md" onPress={() => Linking.openSettings()} />
        </View>
      ) : (
        <Text style={[type.caption, { textAlign: 'center' }]}>Camera access is used to scan UPI QR codes for payment preparation.</Text>
      )}
      <ManualUpiSheet visible={manual} onClose={() => setManual(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  stepBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stepIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
