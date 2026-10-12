import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, elevation, radius, space, type, useIsLight } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { ScalePressable } from './ScalePressable';

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const isLight = useIsLight();

  return (
    <View style={{ gap: space.sm }}>
      {title ? <Text style={[type.overline, { marginLeft: space.xs }, isLight && { color: '#64748B' }]}>{title}</Text> : null}
      <View
        style={[
          styles.group,
          isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' },
          isLight && elevation.low,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function SettingsRow({ icon, label, value, onPress, danger, right }: { icon: IconName; label: string; value?: string | null; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  const isLight = useIsLight();

  const body = (
    <View style={[styles.row, isLight && { borderBottomColor: '#F1F5F9' }]}>
      <View style={[styles.icon, danger && { backgroundColor: colors.errorSoft }, isLight && !danger && { backgroundColor: '#ECFDF5' }]}>
        <Icon name={icon} size={18} color={danger ? colors.error : colors.primary} />
      </View>
      <Text style={[type.bodyStrong, { flex: 1 }, isLight && { color: '#1A1A1A' }, danger && { color: colors.error }]}>{label}</Text>
      {value ? <Text style={[type.label, { maxWidth: '45%' }, isLight && { color: '#475569' }]} numberOfLines={1}>{value}</Text> : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={isLight ? '#94A3B8' : colors.textMuted} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return <ScalePressable onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}>{body}</ScalePressable>;
}

export function SettingsToggle({ icon, label, description, value, onChange }: { icon: IconName; label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  const isLight = useIsLight();

  return (
    <View style={[styles.row, isLight && { borderBottomColor: '#F1F5F9' }]}>
      <View style={[styles.icon, isLight && { backgroundColor: '#ECFDF5' }]}>
        <Icon name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, isLight && { color: '#1A1A1A' }]}>{label}</Text>
        {description ? <Text style={[type.caption, isLight && { color: '#64748B' }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: isLight ? '#E2E8F0' : colors.surfaceStrong }}
        thumbColor={value ? '#FFFFFF' : (isLight ? '#FFFFFF' : colors.textSecondary)}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 58, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
