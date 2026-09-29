import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/tokens';

/** Floating scan frame with corner brackets and an animated beam. */
export function QRScannerFrame({ size, active, success }: { size: number; active: boolean; success?: boolean }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  const float = useSharedValue(0);
  useEffect(() => {
    if (active && !reduce) {
      y.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
      float.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
  }, [active, reduce, y, float]);
  const beam = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * (size - 6) }] }));
  const frame = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + float.value * 8 }, { perspective: 800 }, { rotateX: `${(float.value - 0.5) * 6}deg` }] }));
  const c = success ? colors.success : colors.primary;
  const L = size * 0.18;
  return (
    <Animated.View style={[{ width: size, height: size }, frame]} pointerEvents="none">
      {[
        { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 },
        { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 },
        { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 },
        { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 },
      ].map((s, i) => (
        <View key={i} style={[styles.corner, { width: L, height: L, borderColor: c }, s]} />
      ))}
      {active && !success ? (
        <Animated.View style={[styles.beamWrap, beam]}>
          <LinearGradient colors={['rgba(16,227,154,0)', 'rgba(16,227,154,0.9)', 'rgba(16,227,154,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.beam} />
          <LinearGradient colors={['rgba(16,227,154,0.18)', 'rgba(16,227,154,0)']} style={{ height: 40 }} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute' },
  beamWrap: { position: 'absolute', left: 12, right: 12, top: 0 },
  beam: { height: 3, borderRadius: 2 },
});
