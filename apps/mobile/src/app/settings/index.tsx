import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { useSettings } from '@/lib/settings';
import { appNameForPackage } from '@/lib/upiLaunch';

export default function SettingsIndexScreen() {
  const settings = useSettings();

  return (
    <Screen back title="Settings">
      <SettingsGroup title="Customization">
        <SettingsRow
          icon="color-palette-outline"
          label="Appearance & Themes"
          value={settings.themeMode.toUpperCase()}
          onPress={() => router.push('/settings/appearance')}
        />
      </SettingsGroup>

      <SettingsGroup title="Transactions">
        <SettingsRow
          icon="card-outline"
          label="Payment Preferences"
          value={appNameForPackage(settings.preferredUpiPackage) ?? 'Ask every time'}
          onPress={() => router.push('/settings/payments')}
        />
      </SettingsGroup>

      <SettingsGroup title="Alerts & Reminders">
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          value={settings.notifyBudgets ? 'Active' : 'Disabled'}
          onPress={() => router.push('/settings/notifications')}
        />
      </SettingsGroup>

      <SettingsGroup title="System">
        <SettingsRow
          icon="information-circle-outline"
          label="About PayTrack"
          value="v1.0.7"
          onPress={() => router.push('/settings/about')}
        />
      </SettingsGroup>
    </Screen>
  );
}
