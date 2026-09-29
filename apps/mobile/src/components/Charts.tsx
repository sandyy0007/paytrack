import { formatINR, formatINRCompact } from '@paytrack/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import { colors, fonts, space, type } from '@/theme/tokens';
import { ScalePressable } from './ScalePressable';

const ACircle = Animated.createAnimatedComponent(Circle);

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/* --------------------------------- Donut -------------------------------- */

export interface DonutSlice { label: string; value: number; color: string }

function DonutArc({ r, stroke, color, length, offset, circ, delay }: { r: number; stroke: number; color: string; length: number; offset: number; circ: number; delay: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: reduce ? 0 : 800 + delay, easing: Easing.out(Easing.cubic) });
  }, [length, p, delay, reduce]);
  const props = useAnimatedProps(() => ({ strokeDasharray: [Math.max(0, length * p.value - 2), circ] }));
  return <ACircle r={r} cx={0} cy={0} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDashoffset={-offset} animatedProps={props} />;
}

/** Interactive donut: tap a legend row to focus a slice. */
export function DonutChart({ data, size = 180, centerLabel }: { data: DonutSlice[]; size?: number; centerLabel: string }) {
  const [focus, setFocus] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const stroke = 18;
  const r = (size - stroke) / 2 - 4;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const focused = focus != null ? data[focus] : undefined;
  return (
    <View style={styles.donutRow}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G x={size / 2} y={size / 2} rotation={-90}>
            <Circle r={r} fill="none" stroke={colors.surfaceStrong} strokeWidth={stroke} />
            {total > 0 && data.map((d, i) => {
              const len = (d.value / total) * circ;
              const el = (
                <G key={d.label} opacity={focus == null || focus === i ? 1 : 0.25}>
                  <DonutArc r={r} stroke={stroke} color={d.color} length={len} offset={acc} circ={circ} delay={i * 60} />
                </G>
              );
              acc += len;
              return el;
            })}
          </G>
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={type.caption}>{focused ? focused.label : centerLabel}</Text>
          <Text style={[type.h3, { fontVariant: ['tabular-nums'] }]}>{formatINR(focused ? focused.value : total)}</Text>
          {focused && total > 0 ? <Text style={type.caption}>{Math.round((focused.value / total) * 100)}%</Text> : null}
        </View>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        {data.slice(0, 6).map((d, i) => (
          <ScalePressable key={d.label} onPress={() => setFocus(focus === i ? null : i)} hapticStyle="select" accessibilityRole="button"
            accessibilityLabel={`${d.label} ${formatINR(d.value)}, ${total ? Math.round((d.value / total) * 100) : 0} percent`}>
            <View style={[styles.legendRow, focus === i && { backgroundColor: colors.surfaceStrong }]}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={[type.label, { flex: 1, color: colors.text }]} numberOfLines={1}>{d.label}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{total ? Math.round((d.value / total) * 100) : 0}%</Text>
            </View>
          </ScalePressable>
        ))}
      </View>
    </View>
  );
}

/* ---------------------------------- Bars -------------------------------- */

export function BarChart({ data, height = 150 }: { data: { label: string; value: number; highlight?: boolean }[]; height?: number }) {
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const bw = w > 0 ? (w - gap * (data.length - 1)) / data.length : 0;
  const chartH = height - 22;
  const selected = sel != null ? data[sel] : undefined;
  return (
    <View onLayout={onLayout}>
      <Text style={[type.caption, { marginBottom: space.sm, minHeight: 16 }]}>
        {selected ? `${selected.label}: ${formatINR(selected.value)}` : `Peak ${formatINR(max === 1 ? 0 : max)}`}
      </Text>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <SvgLinearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.primaryDeep} stopOpacity={0.55} />
            </SvgLinearGradient>
            <SvgLinearGradient id="barDim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.55} />
              <Stop offset="1" stopColor={colors.cyan} stopOpacity={0.12} />
            </SvgLinearGradient>
          </Defs>
          <Line x1={0} x2={w} y1={chartH} y2={chartH} stroke={colors.border} />
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(4, (d.value / max) * (chartH - 8)) : 2;
            const x = i * (bw + gap);
            return (
              <G key={i} onPress={() => setSel(sel === i ? null : i)}>
                <Rect x={x} y={0} width={bw} height={chartH} fill="transparent" />
                <Rect x={x} y={chartH - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={d.highlight || sel === i ? 'url(#bar)' : 'url(#barDim)'} />
              </G>
            );
          })}
        </Svg>
      )}
      <View style={styles.xLabels}>
        {data.map((d, i) => (i % Math.ceil(data.length / 7) === 0 ? <Text key={i} style={[styles.xLabel, { width: bw + gap }]}>{d.label.split(' ')[0]}</Text> : <View key={i} style={{ width: bw + gap }} />))}
      </View>
    </View>
  );
}

/* ---------------------------------- Line -------------------------------- */

export function LineChart({ data, height = 150 }: { data: { label: string; value: number }[]; height?: number }) {
  const [w, onLayout] = useWidth();
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = 10;
  const pts = data.map((d, i) => ({
    x: pad + (data.length > 1 ? (i / (data.length - 1)) * (w - pad * 2) : 0),
    y: pad + (1 - d.value / max) * (height - pad * 2 - 18),
  }));
  const path = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = pts[i - 1]!;
    const cx = (prev.x + p.x) / 2;
    return `${acc} C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  }, '');
  const baseY = height - 18;
  const area = pts.length ? `${path} L${pts[pts.length - 1]!.x},${baseY} L${pts[0]!.x},${baseY} Z` : '';
  return (
    <View onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <SvgLinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.cyan} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.cyan} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          <Path d={area} fill="url(#area)" />
          <Path d={path} stroke={colors.cyan} strokeWidth={2.5} fill="none" />
          {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={i === pts.length - 1 ? colors.primary : colors.cyan} />)}
        </Svg>
      )}
      <View style={[styles.xLabels, { marginTop: -16, justifyContent: 'space-between' }]}>
        {data.map((d) => <Text key={d.label} style={styles.xLabel}>{d.label}</Text>)}
      </View>
      <Text style={[type.caption, { marginTop: space.xs }]}>Max {formatINRCompact(max === 1 ? 0 : max)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: 10, minHeight: 36 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  xLabels: { flexDirection: 'row', marginTop: 4 },
  xLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.textMuted },
});
