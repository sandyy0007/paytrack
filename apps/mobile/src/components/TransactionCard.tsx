import { DEFAULT_CATEGORIES, formatINR } from '@paytrack/shared';
import { memo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { fmtRelative } from '@/lib/format';
import type { LocalExpense } from '@/lib/repo';
import { colors, fonts, radius, space, type } from '@/theme/tokens';
import { categoryIcon, Icon, type IconName } from './Icon';
import { ScalePressable } from './ScalePressable';
import { StatusBadge } from './StatusBadge';

export function categoryMeta(name: string) {
  return DEFAULT_CATEGORIES.find((c) => c.name === name) ?? { name, icon: 'other', color: '#9CA3AF' };
}

interface Props {
  expense: LocalExpense;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showUtr?: boolean;
}

function Action({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <ScalePressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.action, { backgroundColor: color }]}>
      <Icon name={icon} size={20} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </ScalePressable>
  );
}

export const TransactionCard = memo(function TransactionCard({ expense: e, onPress, onEdit, onDelete, showUtr }: Props) {
  const ref = useRef<SwipeableMethods>(null);
  const cat = categoryMeta(e.category);
  const ref_ = e.utr ?? e.transactionReference;
  const card = (
    <ScalePressable
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${formatINR(e.amountPaise)} to ${e.payeeName ?? e.upiId ?? 'payee'} for ${e.reason}`}
      accessibilityHint="Opens payment details"
      style={styles.card}
    >
      <View style={[styles.icon, { backgroundColor: `${cat.color}1f` }]}>
        <Icon name={categoryIcon(cat.icon)} size={20} color={cat.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{e.payeeName || e.upiId || 'Cash payment'}</Text>
        <Text style={[type.label]} numberOfLines={1}>
          {e.financialType === 'LENT' ? 'Money Lent · Udhaar' : `${e.reason} · ${e.category}`}
        </Text>
        <Text style={type.caption}>{fmtRelative(e.expenseDate)}</Text>
        {showUtr && e.utr ? (
          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>UTR {e.utr}</Text>
        ) : showUtr && e.transactionReference ? (
          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>Ref {e.transactionReference}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[type.money, e.status !== 'PAID' && { color: colors.textSecondary }]}>{formatINR(e.amountPaise)}</Text>
        <StatusBadge status={e.status} compact />
        {e.syncState === 'error' ? <Icon name="cloud-offline-outline" size={14} color={colors.warning} /> : null}
      </View>
    </ScalePressable>
  );
  if (!onEdit && !onDelete) return card;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Action icon="eye-outline" label="View" color={colors.surfacePressed} onPress={() => { ref.current?.close(); onPress(); }} />
          {onEdit ? <Action icon="create-outline" label="Edit" color="rgba(59,130,246,0.35)" onPress={() => { ref.current?.close(); onEdit(); }} /> : null}
          {onDelete ? <Action icon="trash-outline" label="Delete" color="rgba(248,113,113,0.4)" onPress={() => { ref.current?.close(); onDelete(); }} /> : null}
        </View>
      )}
    >
      {card}
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg,
    backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.xs, paddingLeft: space.sm },
  action: { width: 68, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.text },
});
