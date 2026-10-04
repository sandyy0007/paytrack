import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { ConfirmDialog, BottomSheet } from '@/components/Overlays';
import { Avatar } from '@/components/PayeeCard';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { InlineNotice } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { TextField } from '@/components/TextField';
import { api, ApiError } from '@/lib/api';
import { logout } from '@/lib/auth';
import { fmtRelative } from '@/lib/format';
import { useSession, type User } from '@/lib/session';
import { useSettings } from '@/lib/settings';
import { syncNow, useSyncState } from '@/lib/sync';
import { appNameForPackage } from '@/lib/upiLaunch';
import { colors, space, type } from '@/theme/tokens';

function EditProfile({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session, updateUser } = useSession();
  const [name, setName] = useState(session?.user.name === 'there' ? '' : session?.user.name ?? '');
  const [phone, setPhone] = useState(session?.mode === 'remote' ? session.user.phone ?? '' : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return setErr('Enter your name.');
    if (phone.trim() && !/^\+?[0-9]{10,15}$/.test(phone.trim())) return setErr('Enter 10–15 digits, optionally starting with +.');
    setBusy(true);
    try {
      if (session?.mode === 'remote') {
        const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { name: name.trim(), phone: phone.trim() || null } });
        await updateUser(r.user);
      } else {
        await updateUser({ name: name.trim() });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit profile">
      <View style={{ gap: space.lg }}>
        <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" />
        {session?.mode === 'remote' ? <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /> : null}
        {err ? <InlineNotice tone="error" text={err} /> : null}
        <PrimaryButton label="Save" onPress={save} loading={busy} size="md" />
      </View>
    </BottomSheet>
  );
}

export default function Profile() {
  const { session, expired } = useSession();
  const settings = useSettings();
  const sync = useSyncState();
  const [editing, setEditing] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!session) return null;
  const remote = session.mode === 'remote';
  const name = session.user.name === 'there' ? 'PayTrack user' : session.user.name;

  return (
    <Screen bottomInset={TAB_CONTENT_INSET}>
      <Text style={type.h1} accessibilityRole="header">Profile</Text>
      <GlassCard variant="hero" padding={space.xl} onPress={() => setEditing(true)} accessibilityLabel="Edit profile">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar name={name} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={type.h2} numberOfLines={1}>{name}</Text>
            <Text style={type.label} numberOfLines={1}>{remote ? session.user.email : 'Local profile — data stays on this device'}</Text>
          </View>
        </View>
      </GlassCard>

      {expired ? <InlineNotice tone="warning" icon="key-outline" text="Your session expired. Sign in again to resume syncing — your local data is safe." /> : null}
      {!remote ? <PrimaryButton label="Sign in to sync & back up" icon="cloud-upload-outline" size="md" onPress={() => router.push('/login')} /> : null}

      <SettingsGroup title="Account">
        <SettingsRow icon="person-outline" label="Name" value={name} onPress={() => setEditing(true)} />
        {remote ? <SettingsRow icon="mail-outline" label="Email" value={session.user.email} /> : null}
        {remote ? <SettingsRow icon="call-outline" label="Phone" value={session.user.phone ?? 'Add'} onPress={() => setEditing(true)} /> : null}
        <SettingsRow icon="cash-outline" label="Currency" value="INR (₹)" />
        <SettingsRow icon={sync.status === 'offline' ? 'cloud-offline-outline' : 'cloud-done-outline'} label="Sync"
          value={!remote ? 'Device only' : sync.pending ? `${sync.pending} waiting` : sync.lastSyncedAt ? `Synced ${fmtRelative(sync.lastSyncedAt)}` : 'Up to date'}
          onPress={remote ? () => void syncNow() : undefined} />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow icon="color-palette-outline" label="Appearance & Theme" value={settings.themeMode.toUpperCase()} onPress={() => router.push('/profile/settings')} />
        <SettingsRow icon="pricetag-outline" label="Default category" value={settings.defaultCategory ?? 'None'} onPress={() => router.push('/profile/settings')} />
        <SettingsRow icon="phone-portrait-outline" label="UPI app" value={appNameForPackage(settings.preferredUpiPackage) ?? 'Ask every time'} onPress={() => router.push('/profile/settings')} />
        <SettingsRow icon="wallet-outline" label="Budget settings" onPress={() => router.push('/budgets')} />
        <SettingsRow icon="notifications-outline" label="Notification settings" onPress={() => router.push('/profile/settings')} />
      </SettingsGroup>

      <SettingsGroup title="Data & safety">
        <SettingsRow icon="lock-closed-outline" label="Security & App Lock" value={settings.appLockEnabled ? 'PIN Protected' : 'None'} onPress={() => router.push('/profile/security')} />
        <SettingsRow icon="eye-off-outline" label="Privacy" onPress={() => router.push('/profile/privacy')} />
        <SettingsRow icon="download-outline" label="Export & Backup" value="CSV · PDF · JSON" onPress={() => router.push('/profile/export')} />
      </SettingsGroup>

      <SettingsGroup title="About & App Info">
        <SettingsRow icon="information-circle-outline" label="App Version" value="1.0.4 (Latest Build)" />
        <SettingsRow icon="code-slash-outline" label="Build Identifier" value="20261004-V5-FINAL" />
        <SettingsRow icon="server-outline" label="Schema Status" value="v5 (Reconciled)" />
        <SettingsRow icon="bug-outline" label="Diagnostics" value="Open" onPress={() => router.push('/pay/debug')} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon="trash-outline" label="Delete account" danger onPress={() => router.push('/profile/security')} />
        <SettingsRow icon="log-out-outline" label={remote ? 'Logout' : 'Reset local profile'} danger onPress={() => setConfirmLogout(true)} />
      </SettingsGroup>
      <Text style={[type.caption, { textAlign: 'center', color: colors.textMuted }]}>PayTrack 1.0.4 (20261004-V5-FINAL) · Pay First. Track Automatically.</Text>

      <EditProfile key={String(editing)} visible={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        visible={confirmLogout}
        title={remote ? 'Log out?' : 'Reset this device?'}
        message={remote
          ? `Your synced data stays in your account. ${sync.pending ? `${sync.pending} change(s) haven't synced yet and will be lost from this device.` : 'Local copies will be removed from this device.'}`
          : 'All expenses stored only on this device will be permanently deleted.'}
        confirmLabel={remote ? 'Log out' : 'Delete local data'}
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => { setConfirmLogout(false); await logout(); router.replace('/login'); }}
      />
    </Screen>
  );
}
