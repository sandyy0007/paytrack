import { useEffect } from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radius, space, type } from '@/theme/tokens';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { Icon, type IconName } from './Icon';

export function EmptyState({ icon = 'sparkles-outline', title, message, cta, onCta }: { icon?: IconName; title: string; message?: string; cta?: string; onCta?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconBubble}><Icon name={icon} size={30} color={colors.primary} /></View>
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{message}</Text> : null}
      {cta && onCta ? <PrimaryButton label={cta} onPress={onCta} icon="add" size="md" style={{ marginTop: space.sm, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBubble, { backgroundColor: colors.errorSoft }]}><Icon name="alert-circle-outline" size={30} color={colors.error} /></View>
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{message}</Text> : null}
      {onRetry ? <SecondaryButton label="Try again" onPress={onRetry} icon="refresh" size="md" style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function Skeleton({ width = '100%', height = 16, r = radius.sm }: { width?: DimensionValue; height?: number; r?: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.4);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o, reduce]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceStrong }, a]} />;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: space.md }} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton width={44} height={44} r={radius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" />
            <Skeleton width="40%" height={12} />
          </View>
          <Skeleton width={60} height={18} />
        </View>
      ))}
    </View>
  );
}

export function InlineNotice({ icon = 'information-circle-outline', text, tone = 'info' }: { icon?: IconName; text: string; tone?: 'info' | 'warning' | 'error' | 'success' }) {
  const c = tone === 'warning' ? colors.warning : tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.cyan;
  const bg = tone === 'warning' ? colors.warningSoft : tone === 'error' ? colors.errorSoft : tone === 'success' ? colors.successSoft : colors.cyanSoft;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon name={icon} size={18} color={c} />
      <Text style={[type.label, { color: colors.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={type.h3} accessibilityRole="header">{title}</Text>
      {action && onAction ? <Text style={[type.label, { color: colors.primary }]} onPress={onAction} accessibilityRole="button">{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
  iconBubble: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: space.xs },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
});
