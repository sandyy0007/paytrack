import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space, type } from '@/theme/tokens';
import { GlassCard } from './GlassCard';
import { Icon } from './Icon';

export function initials(name: string | null | undefined, fallback = '₹'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || fallback;
}

export function Avatar({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {name ? <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text> : <Icon name="person" size={size * 0.45} color={colors.primary} />}
    </View>
  );
}

/**
 * Shows payee details exactly as read from the QR. Deliberately makes NO
 * verification claim — the UPI app / bank handles the beneficiary.
 */
export function PayeeCard({ name, upiId, merchant, manual }: { name: string | null | undefined; upiId: string; merchant?: boolean; manual?: boolean }) {
  return (
    <GlassCard variant="hero" padding={space.xl}>
      <View style={styles.row}>
        <Avatar name={name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.overline}>Payee name</Text>
          <Text style={type.h2} numberOfLines={2}>{name || 'Name not in QR'}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <Text style={type.overline}>UPI ID</Text>
      <Text style={[type.bodyStrong, { marginTop: 2 }]} selectable>{upiId}</Text>
      {merchant ? <Text style={[type.caption, { marginTop: space.xs }]}>Merchant QR</Text> : null}
      <View style={styles.note} accessibilityRole="text">
        <Icon name={manual ? 'create-outline' : 'qr-code-outline'} size={14} color={colors.textSecondary} />
        <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
          {manual ? 'Details entered by you.' : 'Details read from scanned QR.'} PayTrack doesn't verify accounts — your UPI app will show the registered name before you pay.
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(16,227,154,0.35)' },
  avatarText: { fontFamily: fonts.bold, color: colors.primary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.lg },
  note: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'flex-start' },
});
