import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/** Softly floating, lit 3D sphere for the spending card. Pure SVG + one transform. */
export function SpendingSphere({ size = 96 }: { size?: number }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduce) t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, reduce]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -3 + t.value * 6 }] }));
  const r = size / 2;
  return (
    <Animated.View style={[{ width: size, height: size }, float]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="body" cx="35%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#7CFFD2" stopOpacity={0.95} />
            <Stop offset="0.45" stopColor={colors.primary} stopOpacity={0.75} />
            <Stop offset="1" stopColor="#053B2A" stopOpacity={0.9} />
          </RadialGradient>
          <RadialGradient id="rim" cx="70%" cy="80%" r="50%">
            <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.6" stopColor={colors.primary} stopOpacity={0.25} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#glow)" />
        <Circle cx={r} cy={r} r={r * 0.72} fill="url(#body)" />
        <Circle cx={r} cy={r} r={r * 0.72} fill="url(#rim)" />
        <Ellipse cx={r * 0.72} cy={r * 0.62} rx={r * 0.2} ry={r * 0.12} fill="#FFFFFF" opacity={0.55} transform={`rotate(-30 ${r * 0.72} ${r * 0.62})`} />
      </Svg>
    </Animated.View>
  );
}
