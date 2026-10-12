import * as ImagePicker from 'expo-image-picker';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SecondaryButton } from '@/components/Buttons';
import { FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { SettingsGroup } from '@/components/SettingsRow';
import { haptic } from '@/lib/haptics';
import { useSettings } from '@/lib/settings';
import { space, type, useThemeColors } from '@/theme/tokens';

export default function AppearanceSettingsScreen() {
  const s = useSettings();
  const c = useThemeColors();

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
    } catch {
      Alert.alert('Wallpaper', 'Could not open image picker.');
    }
  };

  return (
    <Screen back title="Appearance & Themes">
      <SettingsGroup title="Theme Mode">
        <View style={{ gap: space.sm, paddingHorizontal: space.xs, paddingBottom: space.xs }}>
          <Text style={[type.caption, { color: c.textMuted }]}>Choose visual presentation:</Text>
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
            <Text style={[type.bodyStrong, { color: c.text }]}>Custom Wallpaper Setup</Text>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              <SecondaryButton
                label={s.customWallpaperUri ? 'Change Wallpaper Photo' : 'Select Photo from Gallery'}
                icon="image-outline"
                size="md"
                onPress={handlePickWallpaper}
              />

              <Text style={[type.caption, { color: c.textMuted }]}>Wallpaper Opacity</Text>
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

              <Text style={[type.caption, { color: c.textMuted }]}>Blur Softness</Text>
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

              <Text style={[type.caption, { color: c.textMuted }]}>Contrast Overlay</Text>
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
    </Screen>
  );
}
