import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CategoryChip } from '@/components/CategoryChip';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow, SettingsToggle } from '@/components/SettingsRow';
import { UpiAppPicker } from '@/components/UpiAppPicker';
import { api } from '@/lib/api';
import { useLiveQuery } from '@/lib/dataVersion';
import { listCategories } from '@/lib/repo';
import { useSession } from '@/lib/session';
import { useSettings } from '@/lib/settings';
import { appNameForPackage } from '@/lib/upiLaunch';
import { space, type, useThemeColors } from '@/theme/tokens';

export default function PaymentSettingsScreen() {
  const s = useSettings();
  const c = useThemeColors();
  const session = useSession((x) => x.session);
  const cats = useLiveQuery(() => listCategories());
  const [picker, setPicker] = useState(false);

  const setDefault = async (name: string | null) => {
    await s.set({ defaultCategory: name });
    if (session?.mode === 'remote') {
      void api('/me', { method: 'PATCH', body: { defaultCategory: name } }).catch(() => undefined);
    }
  };

  return (
    <Screen back title="Payment Settings">
      <SettingsGroup title="UPI Launch & Preferences">
        <SettingsRow
          icon="phone-portrait-outline"
          label="Preferred UPI app"
          value={appNameForPackage(s.preferredUpiPackage) ?? 'Ask every time'}
          onPress={() => setPicker(true)}
        />
        <SettingsToggle
          icon="chatbubble-outline"
          label="Share reason as UPI note"
          description="The payee can see this note in their UPI app."
          value={s.shareNoteWithPayee}
          onChange={(v) => void s.set({ shareNoteWithPayee: v })}
        />
        <SettingsToggle
          icon="clipboard-outline"
          label="Suggest UTR from clipboard"
          description="Checked once when you return from a UPI app. Never uploaded."
          value={s.clipboardSuggestions}
          onChange={(v) => void s.set({ clipboardSuggestions: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Default Classification">
        <View style={{ gap: space.sm, paddingHorizontal: space.xs, paddingBottom: space.xs }}>
          <Text style={[type.caption, { color: c.textMuted }]}>
            Default category applied to fast untagged payments:
          </Text>
          <View style={styles.chips}>
            <CategoryChip
              name="None"
              icon="other"
              color="#9CA3AF"
              selected={!s.defaultCategory}
              onPress={() => void setDefault(null)}
            />
            {(cats.data ?? []).map((cat) => (
              <CategoryChip
                key={cat.id}
                name={cat.name}
                icon={cat.icon}
                color={cat.color}
                selected={s.defaultCategory === cat.name}
                onPress={() => void setDefault(cat.name)}
              />
            ))}
          </View>
        </View>
      </SettingsGroup>

      <UpiAppPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
});
