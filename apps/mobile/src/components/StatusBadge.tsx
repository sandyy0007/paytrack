import { statusBucket, statusLabel, type ExpenseStatus } from '@paytrack/shared';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

const STYLE: Record<ReturnType<typeof statusBucket>, { fg: string; bg: string; icon: IconName }> = {
  PAID: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  PENDING: { fg: colors.warning, bg: colors.warningSoft, icon: 'time' },
  FAILED: { fg: colors.error, bg: colors.errorSoft, icon: 'close-circle' },
  UNCONFIRMED: { fg: colors.cyan, bg: colors.cyanSoft, icon: 'help-circle' },
  CANCELLED: { fg: colors.textSecondary, bg: colors.neutralSoft, icon: 'remove-circle' },
};

/** Icon + text + colour — status is never conveyed by colour alone. */
export function StatusBadge({ status, compact }: { status: ExpenseStatus; compact?: boolean }) {
  const s = STYLE[statusBucket(status)];
  const label = statusLabel(status);
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} accessibilityLabel={`Status: ${label}`} accessible>
      <Icon name={s.icon} size={compact ? 12 : 14} color={s.fg} />
      <Text style={[styles.text, { color: s.fg }, compact && { fontSize: 11 }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.5 },
});
