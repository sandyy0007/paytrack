import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CategoryChip } from '@/components/CategoryChip';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow, SettingsToggle } from '@/components/SettingsRow';
import { UpiAppPicker } from '@/components/UpiAppPicker';
import { api } from '@/lib/api';
import { useLiveQuery } from '@/lib/dataVersion';
import { ensurePermission } from '@/lib/notifications';
import { listCategories } from '@/lib/repo';
import { useSession } from '@/lib/session';
import { useSettings } from '@/lib/settings';
import { appNameForPackage } from '@/lib/upiLaunch';
import { space, type } from '@/theme/tokens';

export default function SettingsScreen() {
  const s = useSettings();
  const session = useSession((x) => x.session);
  const cats = useLiveQuery(() => listCategories());
  const [picker, setPicker] = useState(false);

  const setDefault = async (name: string | null) => {
    await s.set({ defaultCategory: name });
    if (session?.mode === 'remote') void api('/me', { method: 'PATCH', body: { defaultCategory: name } }).catch(() => undefined);
  };

  return (
    <Screen back title="Settings">
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
