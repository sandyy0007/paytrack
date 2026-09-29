import { formatINR, type ExpenseStatus } from '@paytrack/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { fmtDateLong, fmtTime } from '@/lib/format';
import { colors, elevation, gradients, radius, space, type } from '@/theme/tokens';
import { AmountDisplay } from './AmountDisplay';
import { StatusBadge } from './StatusBadge';

export interface SlipData {
  amountPaise: number;
  payeeName: string | null;
  upiId: string | null;
  reason: string;
  category: string;
  createdAt: string;
  expenseCode: string;
  status: ExpenseStatus;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.overline}>{label}</Text>
      <Text style={[mono ? type.mono : type.bodyStrong]} selectable>{value}</Text>
    </View>
  );
}

function Perforation() {
  return (
    <View style={styles.perf}>
      <View style={[styles.notch, { left: -14 }]} />
      <View style={styles.dash} />
      <View style={[styles.notch, { right: -14 }]} />
    </View>
  );
}

/** 3D receipt card; animates in (tilt + rise) when generated. */
export function PaymentSlip({ data }: { data: SlipData }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) p.value = withDelay(80, withSpring(1, { damping: 14, stiffness: 120 }));
  }, [p, reduce]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [{ perspective: 1000 }, { translateY: (1 - p.value) * 60 }, { rotateX: `${(1 - p.value) * 28}deg` }, { scale: 0.92 + p.value * 0.08 }],
  }));
  const shine = useSharedValue(-1);
  useEffect(() => {
    if (!reduce) shine.value = withDelay(500, withTiming(3, { duration: 1400, easing: Easing.out(Easing.quad) }));
  }, [shine, reduce]);
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shine.value * 320 }, { rotate: '20deg' }] }));

  return (
    <Animated.View style={[styles.slip, elevation.floating, anim]} accessibilityLabel={`Payment slip, ${formatINR(data.amountPaise)} to ${data.payeeName ?? data.upiId}`}>
      <LinearGradient colors={gradients.slip} style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]} />
      <View style={styles.clip} pointerEvents="none">
        <Animated.View style={[styles.shine, shineStyle]} />
      </View>
      <View style={styles.top}>
        <Text style={[type.overline, { color: colors.primary, textAlign: 'center' }]}>Payment slip</Text>
        <View style={{ alignItems: 'center', marginTop: space.md }}>
          <AmountDisplay paise={data.amountPaise} size="xl" />
        </View>
      </View>
      <Perforation />
      <View style={styles.body}>
        <Row label="To" value={[data.payeeName, data.upiId].filter(Boolean).join('\n')} />
        <Row label="For" value={`${data.reason}  ·  ${data.category}`} />
        <View style={styles.grid}>
          <View style={{ flex: 1 }}><Row label="Date" value={fmtDateLong(data.createdAt)} /></View>
          <View style={{ flex: 0.7 }}><Row label="Time" value={fmtTime(data.createdAt)} /></View>
        </View>
        <Row label="Expense ID" value={data.expenseCode} mono />
        <View style={{ gap: 4 }}>
          <Text style={type.overline}>Status</Text>
          <StatusBadge status={data.status} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slip: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: '#0B1117' },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.xl, overflow: 'hidden' },
  shine: { position: 'absolute', top: -60, bottom: -60, width: 60, left: -80, backgroundColor: 'rgba(255,255,255,0.06)' },
  top: { padding: space.xxl, paddingBottom: space.xl },
  perf: { height: 28, justifyContent: 'center' },
  notch: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  dash: { marginHorizontal: space.xxl, borderTopWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  body: { padding: space.xxl, paddingTop: space.lg, gap: space.lg },
  grid: { flexDirection: 'row', gap: space.lg },
});

