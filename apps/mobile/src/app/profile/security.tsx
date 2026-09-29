import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { ConfirmDialog } from '@/components/Overlays';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { ApiError } from '@/lib/api';
import { deleteAccount } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/theme/tokens';

const POINTS: { icon: IconName; t: string; d: string }[] = [
  { icon: 'keypad-outline', t: 'PayTrack never asks for your UPI PIN', d: 'You enter your PIN only inside your UPI app. No OTPs, card PINs or bank passwords are requested or stored.' },
  { icon: 'swap-horizontal-outline', t: 'Payments happen in your UPI app', d: 'PayTrack prepares the payment and records it. Your UPI app and bank execute, authenticate and validate it.' },
  { icon: 'lock-closed-outline', t: 'Secure storage', d: 'Sign-in tokens are kept in Android encrypted secure storage. Server traffic uses HTTPS.' },
  { icon: 'qr-code-outline', t: 'No fake verification', d: 'Payee details are shown exactly as read from the QR. PayTrack does not verify accounts.' },
];

export default function Security() {
  const session = useSession((s) => s.session);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen back title="Security">
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
      <SecondaryButton label={session?.mode === 'remote' ? 'Delete account & all data' : 'Delete all data on this device'} icon="trash-outline" variant="danger" onPress={() => setConfirm(true)} />
      <ConfirmDialog
        visible={confirm}
        title="Delete everything?"
        message={session?.mode === 'remote' ? 'Your account and every expense, budget and timeline on our servers and this device will be permanently deleted. This cannot be undone.' : 'Every expense and budget on this device will be permanently deleted.'}
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
    </Screen>
  );
}
