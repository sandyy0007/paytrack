import { Text, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { colors, space, type } from '@/theme/tokens';

const ITEMS: { icon: IconName; t: string; d: string }[] = [
  { icon: 'camera-outline', t: 'Camera', d: 'Camera access is used to scan UPI QR codes for payment preparation. Frames are processed on your device and never saved or uploaded.' },
  { icon: 'clipboard-outline', t: 'Clipboard', d: 'Clipboard access is used only to help detect a transaction reference after payment — read once when the UTR screen opens, never monitored continuously, and never uploaded unless you confirm and save it. You can turn this off in Settings.' },
  { icon: 'notifications-outline', t: 'Notifications', d: 'Only budget alerts and a reminder for unconfirmed payments. No marketing.' },
  { icon: 'server-outline', t: 'What we store', d: 'Your expense records (amount, payee name and UPI ID from the QR, reason, category, timestamps, status, UTR/reference). No contacts, SMS, location or bank credentials.' },
  { icon: 'phone-portrait-outline', t: 'Local-first', d: 'Records are saved on your device first and synced to your account when online. Without an account, nothing leaves your device.' },
  { icon: 'download-outline', t: 'Your data, your control', d: 'Export everything as CSV or PDF, or permanently delete your account from Security.' },
];

export default function Privacy() {
  return (
    <Screen back title="Privacy">
      {ITEMS.map((i) => (
        <GlassCard key={i.t} padding={space.lg}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Icon name={i.icon} size={22} color={colors.cyan} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.bodyStrong}>{i.t}</Text>
              <Text style={type.label}>{i.d}</Text>
            </View>
          </View>
        </GlassCard>
      ))}
    </Screen>
  );
}
