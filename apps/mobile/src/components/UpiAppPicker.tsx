import { KNOWN_UPI_APPS } from '@paytrack/shared';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '@/lib/settings';
import { colors, radius, space, type } from '@/theme/tokens';
import { Icon } from './Icon';
import { BottomSheet } from './Overlays';
import { ScalePressable } from './ScalePressable';

/**
 * Preferred UPI app. PayTrack can't list installed apps without extra
 * permissions, so "Ask every time" (system chooser) is the safe default.
 */
export function UpiAppPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { preferredUpiPackage, set } = useSettings();
  const options = [{ id: 'system', name: 'Ask every time', packageName: null as string | null }, ...KNOWN_UPI_APPS];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pay with">
      <View style={{ gap: space.xs }}>
        {options.map((o) => {
          const on = preferredUpiPackage === o.packageName;
          return (
            <ScalePressable key={o.id} onPress={() => { void set({ preferredUpiPackage: o.packageName }); onClose(); }} hapticStyle="select"
              accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.name} style={[styles.row, on && styles.on]}>
              <Icon name={o.packageName ? 'phone-portrait-outline' : 'apps-outline'} size={20} color={on ? colors.primary : colors.textSecondary} />
              <Text style={[type.bodyStrong, { flex: 1 }]}>{o.name}</Text>
              {on ? <Icon name="checkmark-circle" size={20} color={colors.primary} /> : null}
            </ScalePressable>
          );
        })}
        <Text style={[type.caption, { marginTop: space.sm }]}>If the chosen app isn't installed, PayTrack will tell you and let you pick another.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, minHeight: 52 },
  on: { backgroundColor: colors.primarySoft },
});
