import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSettings } from '@/lib/settings';
import { colors, elevation, gradients, radius, space } from '@/theme/tokens';
import { ScalePressable } from './ScalePressable';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'hero' | 'flat' | 'slip';
  padding?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Layered glass surface: gradient fill, hairline border, top-edge light, soft depth. */
export function GlassCard({ children, style, variant = 'default', padding = space.lg, onPress, accessibilityLabel }: Props) {
  const themeMode = useSettings((s) => s.themeMode);
  const isLight = themeMode === 'light';
  const fill = isLight
    ? (['#FFFFFF', '#F8FAFC'] as const)
    : variant === 'hero' ? gradients.heroCard : variant === 'slip' ? gradients.slip : gradients.glass;
  const inner = (
    <View style={[
      styles.card,
      variant !== 'flat' && elevation.card,
      isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', shadowColor: '#64748B', shadowOpacity: 0.08 },
      style,
    ]}>
      <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.round]} />
      {!isLight && (
        <LinearGradient
          colors={[colors.highlight, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.35 }}
          style={[StyleSheet.absoluteFill, styles.round]}
          pointerEvents="none"
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
  if (!onPress) return inner;
  return (
    <ScalePressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} scaleTo={0.98}>
      {inner}
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    overflow: 'visible',
  },
  round: { borderRadius: radius.xl },
});
