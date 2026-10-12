import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { space, type, useThemeColors } from '@/theme/tokens';

export default function AboutSettingsScreen() {
  const c = useThemeColors();

  return (
    <Screen back title="About PayTrack">
      <GlassCard padding={space.lg} style={{ marginBottom: space.md }}>
        <Text style={[type.h2, { color: c.text }]}>PayTrack</Text>
        <Text style={[type.body, { color: c.textMuted, marginTop: space.xs }]}>
          Pay First. Track Automatically.
        </Text>
        <Text style={[type.caption, { color: c.textSecondary, marginTop: space.sm }]}>
          Your private, local-first UPI payment and expense tracking companion. No banking credentials required.
        </Text>
      </GlassCard>

      <SettingsGroup title="Application Details">
        <SettingsRow icon="information-circle-outline" label="App Version" value="1.0.7" />
        <SettingsRow icon="code-slash-outline" label="Build Identifier" value="20261007-V8-RELEASE" />
        <SettingsRow icon="server-outline" label="Schema Version" value="v6 (Production Reconciled)" />
        <SettingsRow icon="shield-checkmark-outline" label="Security" value="Local SQLite + AES Encrypted Storage" />
      </SettingsGroup>

      {__DEV__ ? (
        <SettingsGroup title="Developer Diagnostics">
          <SettingsRow
            icon="bug-outline"
            label="Payment Diagnostics"
            value="Inspect"
            onPress={() => router.push('/pay/debug')}
          />
        </SettingsGroup>
      ) : null}

      <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
        <Text style={[type.caption, { color: c.textMuted }]}>
          PayTrack · Version 1.0.7 (Build 8)
        </Text>
      </View>
    </Screen>
  );
}
