import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, elevation, fonts, gradients, HIT, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { ScalePressable } from './ScalePressable';

interface BaseProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  size?: 'md' | 'lg';
}

export function PrimaryButton({ label, onPress, icon, loading, disabled, style, accessibilityHint, size = 'lg' }: BaseProps) {
  const h = size === 'lg' ? 58 : HIT;
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || loading}
      hapticStyle="press"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[{ borderRadius: radius.lg }, !disabled && elevation.glow, style]}
    >
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, { height: h }]}>
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <View style={styles.row}>
            {icon && <Icon name={icon} size={20} color={colors.onPrimary} />}
            <Text style={[styles.primaryText, size === 'md' && { fontSize: 15 }]}>{label}</Text>
          </View>
        )}
      </LinearGradient>
    </ScalePressable>
  );
}

export function SecondaryButton({ label, onPress, icon, loading, disabled, style, accessibilityHint, variant = 'glass', size = 'lg' }: BaseProps & { variant?: 'glass' | 'danger' | 'ghost' }) {
  const color = variant === 'danger' ? colors.error : colors.text;
  const h = size === 'lg' ? 56 : HIT;
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        styles.base,
        { height: h },
        variant === 'glass' && styles.glass,
        variant === 'danger' && styles.danger,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={19} color={color} />}
          <Text style={[styles.secondaryText, { color }, size === 'md' && { fontSize: 15 }]}>{label}</Text>
        </View>
      )}
    </ScalePressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  return (
    <ScalePressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.iconBtn}>
      <Icon name={icon} size={size} color={color} />
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.onPrimary, letterSpacing: 0.3 },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 16 },
  glass: { backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  danger: { backgroundColor: colors.errorSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(248,113,113,0.35)' },
  iconBtn: {
    width: HIT, height: HIT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
});
