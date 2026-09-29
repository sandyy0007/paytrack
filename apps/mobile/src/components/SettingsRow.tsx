import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, space, type } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { ScalePressable } from './ScalePressable';

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      {title ? <Text style={[type.overline, { marginLeft: space.xs }]}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

export function SettingsRow({ icon, label, value, onPress, danger, right }: { icon: IconName; label: string; value?: string | null; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  const body = (
    <View style={styles.row}>
      <View style={[styles.icon, danger && { backgroundColor: colors.errorSoft }]}><Icon name={icon} size={18} color={danger ? colors.error : colors.primary} /></View>
      <Text style={[type.bodyStrong, { flex: 1 }, danger && { color: colors.error }]}>{label}</Text>
      {value ? <Text style={[type.label, { maxWidth: '45%' }]} numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return <ScalePressable onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}>{body}</ScalePressable>;
}

export function SettingsToggle({ icon, label, description, value, onChange }: { icon: IconName; label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Icon name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{label}</Text>
        {description ? <Text style={type.caption}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primaryDeep, false: colors.surfaceStrong }} thumbColor={value ? colors.primary : colors.textSecondary} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
