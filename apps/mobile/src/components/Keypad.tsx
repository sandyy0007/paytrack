import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space, useIsLight } from '@/theme/tokens';
import { Icon } from './Icon';
import { ScalePressable } from './ScalePressable';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/** Applies a keypad press to a rupee string with max 2 decimals / 7 integer digits. */
export function applyKey(cur: string, key: string): string {
  if (key === 'del') return cur.slice(0, -1);
  if (key === '.') return cur.includes('.') ? cur : (cur || '0') + '.';
  const [int = '', dec] = cur.split('.');
  if (dec !== undefined) return dec.length >= 2 ? cur : cur + key;
  if (int === '0') return key;
  if (int.length >= 7) return cur;
  return cur + key;
}

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const isLight = useIsLight();

  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <ScalePressable
          key={k}
          onPress={() => onKey(k)}
          onLongPress={k === 'del' ? () => onKey('clear') : undefined}
          hapticStyle="select"
          scaleTo={0.92}
          accessibilityRole="keyboardkey"
          accessibilityLabel={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
          style={[
            styles.key,
            isLight && { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
          ]}
        >
          {k === 'del' ? (
            <Icon name="backspace-outline" size={24} color={isLight ? '#1A1A1A' : colors.text} />
          ) : (
            <Text style={[styles.keyText, isLight && { color: '#1A1A1A' }]}>{k}</Text>
          )}
        </ScalePressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.sm },
  key: { width: '31.5%', height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  keyText: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text },
});
