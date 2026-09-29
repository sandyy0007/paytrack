import { timelineLabel, type ExpenseEvent } from '@paytrack/shared';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { fmtDayMonth, fmtTime } from '@/lib/format';
import { colors, space, type } from '@/theme/tokens';

function dotColor(to: string) {
  if (to === 'PAID') return colors.success;
  if (to === 'FAILED') return colors.error;
  if (to === 'CANCELLED') return colors.textMuted;
  if (to === 'UNCONFIRMED') return colors.cyan;
  return colors.primary;
}

function label(ev: ExpenseEvent): string {
  if (ev.meta?.launchFailed) return "Couldn't open a UPI app";
  if (ev.meta?.manualPayment) return 'Paid outside PayTrack (manual)';
  return timelineLabel(ev.toStatus, ev.fromStatus);
}

export function Timeline({ events }: { events: ExpenseEvent[] }) {
  return (
    <View accessibilityRole="list">
      {events.map((ev, i) => (
        <Animated.View key={ev.id} entering={FadeInLeft.delay(i * 70).duration(300)} style={styles.row} accessible accessibilityLabel={`${fmtTime(ev.at)}, ${label(ev)}`}>
          <View style={styles.timeCol}>
            <Text style={[type.bodyStrong, { fontSize: 13 }]}>{fmtTime(ev.at)}</Text>
            <Text style={type.caption}>{fmtDayMonth(ev.at)}</Text>
          </View>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: dotColor(ev.toStatus), shadowColor: dotColor(ev.toStatus) }]} />
            {i < events.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <Text style={[type.body, { flex: 1, paddingBottom: space.lg }]}>{label(ev)}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  timeCol: { width: 72, alignItems: 'flex-end' },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  line: { flex: 1, width: 2, backgroundColor: colors.borderStrong, marginTop: 2 },
});
