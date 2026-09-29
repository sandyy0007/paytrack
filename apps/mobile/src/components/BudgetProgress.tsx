import { budgetUsage, formatINR } from '@paytrack/shared';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, space, type } from '@/theme/tokens';

export function usageColor(level: ReturnType<typeof budgetUsage>['level']) {
  return level === 'OVER' ? colors.error : level === 'HIGH' ? colors.warning : level === 'WARN' ? colors.cyan : colors.primary;
}

export function BudgetProgress({ spentPaise, limitPaise, thresholds }: { spentPaise: number; limitPaise: number; thresholds: number[] }) {
  const u = budgetUsage(spentPaise, limitPaise, thresholds);
  const pct = Math.min(1, u.ratio);
  const reduce = useReducedMotion();
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(pct, { duration: reduce ? 0 : 900, easing: Easing.out(Easing.cubic) });
  }, [pct, w, reduce]);
  const bar = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  const color = usageColor(u.level);
  const label = u.level === 'OVER' ? 'Over budget' : `${Math.round(u.ratio * 100)}% used`;
  return (
    <View style={{ gap: space.sm }} accessible accessibilityLabel={`${formatINR(spentPaise)} of ${formatINR(limitPaise)}, ${label}`}>
      <View style={styles.row}>
        <Text style={[type.money]}>{formatINR(spentPaise)} <Text style={type.label}>/ {formatINR(limitPaise)}</Text></Text>
        <Text style={[type.label, { color }]}>{label}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color, shadowColor: color }, bar]} />
        {thresholds.filter((t) => t < 100).map((t) => <View key={t} style={[styles.tick, { left: `${t}%` }]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, shadowOpacity: 0.8, shadowRadius: 8 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(5,7,10,0.7)' },
});
