import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsToggle } from '@/components/SettingsRow';
import { ensurePermission } from '@/lib/notifications';
import { useSettings } from '@/lib/settings';

export default function NotificationSettingsScreen() {
  const s = useSettings();

  return (
    <Screen back title="Notification Settings">
      <SettingsGroup title="Alert Preferences">
        <SettingsToggle
          icon="wallet-outline"
          label="Budget alerts"
          description="Alerts at your spending thresholds (e.g. 75%, 90%, 100%)."
          value={s.notifyBudgets}
          onChange={async (v) => {
            if (v) await ensurePermission();
            void s.set({ notifyBudgets: v });
          }}
        />
        <SettingsToggle
          icon="time-outline"
          label="Pending payment reminders"
          description="Reminds you once if a transaction isn't confirmed within 20 minutes."
          value={s.notifyPending}
          onChange={async (v) => {
            if (v) await ensurePermission();
            void s.set({ notifyPending: v });
          }}
        />
      </SettingsGroup>
    </Screen>
  );
}
