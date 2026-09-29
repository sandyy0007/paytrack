import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { colors, space, type } from '@/theme/tokens';
import { GlassCard } from './GlassCard';
import { Icon, type IconName } from './Icon';

export function AnalyticsCard({ label, value, icon, sub, tint = colors.primary }: { label: string; value: string; icon: IconName; sub?: string; tint?: string }) {
  return (
    <GlassCard style={{ flex: 1 }} padding={space.lg}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={15} color={tint} />
        <Text style={type.caption} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[type.h3, { marginTop: space.sm, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={[type.caption, { marginTop: 2 }]} numberOfLines={1}>{sub}</Text> : null}
    </GlassCard>
  );
}

export function ChartCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <GlassCard padding={space.xl}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={type.h3} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </GlassCard>
  );
}
