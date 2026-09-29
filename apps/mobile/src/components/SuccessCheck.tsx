import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme/tokens';

const APath = Animated.createAnimatedComponent(Path);
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({ angle: (i / 12) * Math.PI * 2, dist: 70 + (i % 3) * 14, color: i % 2 ? colors.primary : colors.cyan }));

function Particle({ angle, dist, color, progress }: { angle: number; dist: number; color: string; progress: SharedValue<number> }) {
  const s = useAnimatedStyle(() => ({
    opacity: progress.value < 1 ? 1 - progress.value : 0,
    transform: [{ translateX: Math.cos(angle) * dist * progress.value }, { translateY: Math.sin(angle) * dist * progress.value }, { scale: 1 - progress.value * 0.6 }],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: color }, s]} />;
}

/** Animated check with a subtle particle burst. */
export function SuccessCheck({ size = 120, tone = 'success' }: { size?: number; tone?: 'success' | 'error' }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.4);
  const draw = useSharedValue(reduce ? 1 : 0);
  const burst = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    scale.value = withSpring(1, { damping: 10, stiffness: 140 });
    draw.value = withDelay(180, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    if (tone === 'success') burst.value = withDelay(260, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
  }, [scale, draw, burst, reduce, tone]);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const len = 60;
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));
  const c = tone === 'success' ? colors.success : colors.error;
  const d = tone === 'success' ? 'M28 52 L44 67 L74 36' : 'M34 34 L66 66 M66 34 L34 66';
  return (
    <View style={{ width: size * 1.8, height: size * 1.8, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={tone === 'success' ? 'Success' : 'Not completed'}>
      {tone === 'success' && PARTICLES.map((p, i) => <Particle key={i} {...p} progress={burst} />)}
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${c}22`, borderWidth: 2, borderColor: c, alignItems: 'center', justifyContent: 'center', shadowColor: c, shadowOpacity: 0.7, shadowRadius: 30, elevation: 10 }, circle]}>
        <Svg width={size * 0.8} height={size * 0.8} viewBox="0 0 100 100">
          <APath d={d} stroke={c} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={len * (tone === 'success' ? 1 : 1.6)} animatedProps={props} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
});
