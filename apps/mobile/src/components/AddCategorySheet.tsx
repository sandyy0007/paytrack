import { CATEGORY_NAME_RE } from '@paytrack/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addCategory } from '@/lib/repo';
import { colors, space } from '@/theme/tokens';
import { PrimaryButton } from './Buttons';
import { BottomSheet } from './Overlays';
import { ScalePressable } from './ScalePressable';
import { TextField } from './TextField';

const SWATCHES = ['#34D399', '#22D3EE', '#A78BFA', '#FBBF24', '#F472B6', '#FB923C', '#60A5FA', '#F87171'];

export function AddCategorySheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded?: (name: string) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]!);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const n = name.trim();
    if (!CATEGORY_NAME_RE.test(n)) return setErr('Use 2–24 letters, numbers or spaces.');
    try {
      await addCategory(n, color);
      onAdded?.(n);
      setName('');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="New category">
      <View style={{ gap: space.lg }}>
        <TextField label="Name" value={name} onChangeText={(t) => { setName(t); setErr(null); }} placeholder="e.g. Pets" error={err} autoFocus maxLength={24} />
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Colour">
          {SWATCHES.map((c) => (
            <ScalePressable key={c} onPress={() => setColor(c)} hapticStyle="select" accessibilityRole="radio" accessibilityState={{ selected: color === c }} accessibilityLabel={`Colour ${c}`}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.on]} />
          ))}
        </View>
        <PrimaryButton label="Add category" onPress={save} size="md" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  on: { borderWidth: 3, borderColor: colors.text },
});
