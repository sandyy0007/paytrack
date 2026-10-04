import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SecondaryButton } from '@/components/Buttons';
import { CategoryChip, FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow, SettingsToggle } from '@/components/SettingsRow';
import { UpiAppPicker } from '@/components/UpiAppPicker';
import { api } from '@/lib/api';
import { useLiveQuery } from '@/lib/dataVersion';
import { haptic } from '@/lib/haptics';
import { ensurePermission } from '@/lib/notifications';
import { listCategories } from '@/lib/repo';
import { useSession } from '@/lib/session';
import { useSettings, type ThemeMode } from '@/lib/settings';
import { appNameForPackage } from '@/lib/upiLaunch';
import { colors, space, type } from '@/theme/tokens';

export default function SettingsScreen() {
  const s = useSettings();
  const session = useSession((x) => x.session);
  const cats = useLiveQuery(() => listCategories());
  const [picker, setPicker] = useState(false);

  const setDefault = async (name: string | null) => {
    await s.set({ defaultCategory: name });
    if (session?.mode === 'remote') void api('/me', { method: 'PATCH', body: { defaultCategory: name } }).catch(() => undefined);
  };

  const handlePickWallpaper = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        await s.set({
          themeMode: 'custom',
          customWallpaperUri: res.assets[0].uri,
        });
        void haptic.success();
      }
    } catch (err) {
      Alert.alert('Wallpaper', 'Could not open image picker.');
    }
  };

  return (
    <Screen back title="Settings & Appearance">
      {/* Theme & Appearance */}
      <SettingsGroup title="Appearance & Themes">
        <View style={{ gap: space.sm, paddingHorizontal: space.xs, paddingBottom: space.xs }}>
          <Text style={type.caption}>Choose app theme mode:</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <FilterChip
              label="Dark (Obsidian)"
              selected={s.themeMode === 'dark'}
              onPress={() => void s.set({ themeMode: 'dark' })}
            />
            <FilterChip
              label="Light"
              selected={s.themeMode === 'light'}
              onPress={() => void s.set({ themeMode: 'light' })}
            />
            <FilterChip
              label="Custom Photo"
              selected={s.themeMode === 'custom'}
              onPress={() => void s.set({ themeMode: 'custom' })}
            />
          </View>
        </View>

        {s.themeMode === 'custom' ? (
          <GlassCard padding={space.md} style={{ marginHorizontal: space.xs, marginBottom: space.sm }}>
            <Text style={type.bodyStrong}>Custom Wallpaper Setup</Text>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              <SecondaryButton
                label={s.customWallpaperUri ? 'Change Wallpaper Photo' : 'Select Photo from Gallery'}
                icon="image-outline"
                size="md"
                onPress={handlePickWallpaper}
              />

              <Text style={type.caption}>Wallpaper Opacity</Text>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                {[0.2, 0.35, 0.5, 0.7].map((op) => (
                  <FilterChip
                    key={String(op)}
                    label={`${Math.round(op * 100)}%`}
                    selected={s.customWallpaperOpacity === op}
                    onPress={() => void s.set({ customWallpaperOpacity: op })}
                  />
                ))}
              </View>

              <Text style={type.caption}>Blur Softness</Text>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                {[0, 5, 10, 15].map((b) => (
                  <FilterChip
                    key={String(b)}
                    label={`${b}px`}
                    selected={s.customWallpaperBlur === b}
                    onPress={() => void s.set({ customWallpaperBlur: b })}
                  />
                ))}
              </View>

              <Text style={type.caption}>Contrast Overlay</Text>
              <View style={{ flexDirection: 'row', gap: space.xs }}>
                {(['dark', 'light', 'none'] as const).map((ov) => (
                  <FilterChip
                    key={ov}
                    label={ov === 'dark' ? 'Dark Tint' : ov === 'light' ? 'Light Tint' : 'None'}
                    selected={s.customWallpaperOverlay === ov}
                    onPress={() => void s.set({ customWallpaperOverlay: ov })}
                  />
                ))}
              </View>
            </View>
          </GlassCard>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Payments">
        <SettingsRow icon="phone-portrait-outline" label="Preferred UPI app" value={appNameForPackage(s.preferredUpiPackage) ?? 'Ask every time'} onPress={() => setPicker(true)} />
        <SettingsToggle icon="chatbubble-outline" label="Share reason as UPI note" description="The payee can see this note in their UPI app." value={s.shareNoteWithPayee} onChange={(v) => void s.set({ shareNoteWithPayee: v })} />
        <SettingsToggle icon="clipboard-outline" label="Suggest UTR from clipboard" description="Checked once when you return from a UPI app. Never uploaded." value={s.clipboardSuggestions} onChange={(v) => void s.set({ clipboardSuggestions: v })} />
      </SettingsGroup>

      <View style={{ gap: space.sm }}>
        <Text style={[type.overline, { marginLeft: space.xs }]}>Default category</Text>
        <View style={styles.chips}>
          <CategoryChip name="None" icon="other" color="#9CA3AF" selected={!s.defaultCategory} onPress={() => void setDefault(null)} />
          {(cats.data ?? []).map((c) => <CategoryChip key={c.id} name={c.name} icon={c.icon} color={c.color} selected={s.defaultCategory === c.name} onPress={() => void setDefault(c.name)} />)}
        </View>
      </View>

      <SettingsGroup title="Notifications">
        <SettingsToggle icon="wallet-outline" label="Budget alerts" description="At your warning thresholds (e.g. 75%, 90%, 100%)." value={s.notifyBudgets}
          onChange={async (v) => { if (v) await ensurePermission(); void s.set({ notifyBudgets: v }); }} />
        <SettingsToggle icon="time-outline" label="Pending payment reminders" description="One reminder if a payment isn't confirmed within 20 minutes." value={s.notifyPending}
          onChange={async (v) => { if (v) await ensurePermission(); void s.set({ notifyPending: v }); }} />
      </SettingsGroup>
      <UpiAppPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
