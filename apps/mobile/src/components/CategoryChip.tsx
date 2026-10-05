import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '@/theme/tokens';
import { categoryIcon, Icon } from './Icon';
import { ScalePressable } from './ScalePressable';

export function CategoryChip({
  name,
  icon,
  color,
  selected,
  onPress,
  compact,
}: {
  name: string;
  icon: string;
  color: string;
  selected?: boolean;
  onPress?: () => void;
  compact?: boolean;
}) {
  const content = (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        selected && { borderColor: color, backgroundColor: `${color}22` },
      ]}
    >
      <Icon name={categoryIcon(icon)} size={compact ? 13 : 15} color={selected ? color : colors.textSecondary} />
      <Text style={[styles.text, compact && styles.textCompact, selected && { color: colors.text }]}>{name}</Text>
      {selected ? <Icon name="checkmark" size={compact ? 12 : 14} color={color} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <ScalePressable onPress={onPress} hapticStyle="select" accessibilityRole="radio" accessibilityState={{ selected: !!selected }} accessibilityLabel={name}>
      {content}
    </ScalePressable>
  );
}

export function FilterChip({ label, selected, onPress, count }: { label: string; selected: boolean; onPress: () => void; count?: number }) {
  return (
    <ScalePressable onPress={onPress} hapticStyle="select" accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label}>
      <View style={[styles.filter, selected && styles.filterOn]}>
        <Text style={[styles.filterText, selected && { color: colors.onPrimary }]}>{label}{count != null ? ` · ${count}` : ''}</Text>
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipCompact: {
    minHeight: 32,
    paddingHorizontal: 10,
    gap: 4,
  },
  text: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
  textCompact: { fontSize: 12.5 },
  filter: { paddingHorizontal: space.lg, height: 36, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textSecondary },
});
