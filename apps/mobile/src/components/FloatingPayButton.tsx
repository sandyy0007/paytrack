import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, elevation, fonts, gradients } from '@/theme/tokens';
import { Icon } from './Icon';
import { ScalePressable } from './ScalePressable';

/** The dominant extended "+ PAY" FAB: press → scale down → glow → open payment flow. */
export function FloatingPayButton({ onPress, size = 64 }: { onPress: () => void; size?: number }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!reduce) pulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse, reduce]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.45 }] }));

  return (
    <View style={{ height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[styles.ring, { height: size, borderRadius: size / 2 }, ring]} />
      <ScalePressable
        onPress={onPress}
        hapticStyle="press"
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel="Pay"
        accessibilityHint="Scan a UPI QR and create a payment-linked expense"
        style={[elevation.glow, { borderRadius: size / 2 }]}
      >
        <LinearGradient colors={gradients.primary} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.btn, { height: size, borderRadius: size / 2 }]}>
          <View style={styles.shine} />
          <Icon name="add" size={26} color={colors.onPrimary} />
          <Text style={styles.label}>PAY</Text>
        </LinearGradient>
      </ScalePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, right: 0, borderWidth: 2, borderColor: colors.primary },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingLeft: 20, paddingRight: 26, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  shine: { position: 'absolute', top: 5, left: 16, right: 16, height: '36%', borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.22)' },
  label: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.onPrimary, letterSpacing: 1.5 },
});
