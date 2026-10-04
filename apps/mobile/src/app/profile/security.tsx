import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { BottomSheet, ConfirmDialog } from '@/components/Overlays';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow, SettingsToggle } from '@/components/SettingsRow';
import { InlineNotice } from '@/components/States';
import { ApiError } from '@/lib/api';
import { deleteAccount } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { useSettings } from '@/lib/settings';
import { colors, radius, space, type } from '@/theme/tokens';

const POINTS: { icon: IconName; t: string; d: string }[] = [
  { icon: 'keypad-outline', t: 'PayTrack never asks for your UPI PIN', d: 'You enter your PIN only inside your UPI app. No OTPs, card PINs or bank passwords are requested or stored.' },
  { icon: 'swap-horizontal-outline', t: 'Payments happen in your UPI app', d: 'PayTrack prepares the payment and records it. Your UPI app and bank execute, authenticate and validate it.' },
  { icon: 'lock-closed-outline', t: 'Secure storage', d: 'Sign-in tokens are kept in Android encrypted secure storage. Server traffic uses HTTPS.' },
  { icon: 'qr-code-outline', t: 'No fake verification', d: 'Payee details are shown exactly as read from the QR. PayTrack does not verify accounts.' },
];

export default function Security() {
  const session = useSession((s) => s.session);
  const settings = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // App Lock PIN setup modal
  const [pinModal, setPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const handleSavePin = async () => {
    if (pinInput.trim().length !== 4 || !/^[0-9]{4}$/.test(pinInput.trim())) {
      setPinError('Enter a 4-digit numeric PIN.');
      return;
    }
    await settings.set({
      appLockEnabled: true,
      appLockPin: pinInput.trim(),
    });
    void haptic.success();
    setPinModal(false);
    setPinInput('');
  };

  const handleToggleLock = async (enabled: boolean) => {
    if (enabled) {
      setPinModal(true);
    } else {
      await settings.set({
        appLockEnabled: false,
        appLockPin: null,
      });
      void haptic.select();
    }
  };

  return (
    <Screen back title="Security & App Lock">
      {/* Feature G: App Lock */}
      <SettingsGroup title="App Protection">
        <SettingsToggle
          icon="lock-closed-outline"
          label="App PIN Lock"
          description="Requires 4-digit PIN to open PayTrack"
          value={settings.appLockEnabled}
          onChange={handleToggleLock}
        />
        {settings.appLockEnabled ? (
          <SettingsRow
            icon="key-outline"
            label="Change App PIN"
            value="••••"
            onPress={() => setPinModal(true)}
          />
        ) : null}
      </SettingsGroup>

      {POINTS.map((p) => (
        <GlassCard key={p.t} padding={space.lg}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Icon name={p.icon} size={22} color={colors.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.bodyStrong}>{p.t}</Text>
              <Text style={[type.label]}>{p.d}</Text>
            </View>
          </View>
        </GlassCard>
      ))}

      <Text style={[type.overline, { marginTop: space.lg }]}>Danger zone</Text>
      {err ? <InlineNotice tone="error" text={err} /> : null}
      <SecondaryButton
        label={session?.mode === 'remote' ? 'Delete account & all data' : 'Delete all data on this device'}
        icon="trash-outline"
        variant="danger"
        onPress={() => setConfirm(true)}
      />

      <ConfirmDialog
        visible={confirm}
        title="Delete everything?"
        message={
          session?.mode === 'remote'
            ? 'Your account and every expense, budget and timeline on our servers and this device will be permanently deleted. This cannot be undone.'
            : 'Every expense and budget on this device will be permanently deleted.'
        }
        confirmLabel="Delete permanently"
        destructive
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteAccount();
            setConfirm(false);
            router.replace('/login');
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : 'Could not delete the account. Check your connection and try again.');
            setConfirm(false);
          } finally {
            setBusy(false);
          }
        }}
      />

      {/* PIN Setup Modal */}
      <BottomSheet
        visible={pinModal}
        onClose={() => setPinModal(false)}
        title="Set 4-Digit App PIN"
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton
              label="Save PIN"
              disabled={pinInput.trim().length !== 4}
              onPress={handleSavePin}
            />
            <SecondaryButton label="Cancel" variant="ghost" onPress={() => setPinModal(false)} />
          </View>
        }
      >
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          Choose a 4-digit PIN to lock PayTrack on this device.
        </Text>
        <TextInput
          style={styles.pinInput}
          value={pinInput}
          onChangeText={(t) => {
            setPinInput(t.replace(/[^0-9]/g, '').slice(0, 4));
            setPinError(null);
          }}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.textMuted}
          autoFocus
        />
        {pinError ? <Text style={[type.caption, { color: colors.error, marginTop: space.xs }]}>{pinError}</Text> : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pinInput: {
    backgroundColor: colors.surfaceStrong,
    color: colors.text,
    fontSize: 28,
    fontFamily: type.mono.fontFamily,
    letterSpacing: 12,
    textAlign: 'center',
    borderRadius: radius.md,
    paddingVertical: space.md,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
