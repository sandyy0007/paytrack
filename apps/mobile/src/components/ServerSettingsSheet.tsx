import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { apiBaseUrl } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { colors, space, type } from '@/theme/tokens';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { BottomSheet } from './Overlays';
import { TextField } from './TextField';

/** Lets self-hosters / developers point the app at their PayTrack API. */
export function ServerSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { apiUrlOverride, set } = useSettings();
  const [url, setUrl] = useState(apiUrlOverride ?? '');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setUrl(apiUrlOverride ?? ''), [apiUrlOverride, visible]);
  const save = async () => {
    const v = url.trim();
    if (v && !/^https?:\/\/[^\s]+$/.test(v)) return setErr('Enter a full URL like https://api.example.com');
    await set({ apiUrlOverride: v || null });
    onClose();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Server settings">
      <View style={{ gap: space.lg }}>
        <Text style={[type.caption, { color: colors.textSecondary }]}>Current: {apiBaseUrl()}. Use HTTPS in production.</Text>
        <TextField label="API URL" value={url} onChangeText={(t) => { setUrl(t); setErr(null); }} autoCapitalize="none" keyboardType="url" placeholder="https://api.paytrack.example" error={err} />
        <PrimaryButton label="Save" onPress={save} size="md" />
        <SecondaryButton label="Use default" onPress={async () => { await set({ apiUrlOverride: null }); onClose(); }} size="md" variant="ghost" />
      </View>
    </BottomSheet>
  );
}
