import { isValidVpa, parseUpiQr } from '@paytrack/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { usePayFlow } from '@/lib/payFlow';
import { colors, space, type } from '@/theme/tokens';
import { PrimaryButton } from './Buttons';
import { BottomSheet } from './Overlays';
import { TextField } from './TextField';

/** Fallback when a QR can't be scanned: type the UPI ID. */
export function ManualUpiSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [vpa, setVpa] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const setPayload = usePayFlow((s) => s.setPayload);
  const go = () => {
    const v = vpa.trim();
    if (!isValidVpa(v)) return setErr('Enter a valid UPI ID, like name@bank');
    const uri = `upi://pay?pa=${encodeURIComponent(v)}${name.trim() ? `&pn=${encodeURIComponent(name.trim())}` : ''}`;
    const r = parseUpiQr(uri);
    if (!r.ok) return setErr(r.message);
    setPayload(r.payload, 'MANUAL_UPI', uri);
    onClose();
    router.push('/pay/payee');
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Enter UPI ID">
      <View style={{ gap: space.lg }}>
        <TextField label="UPI ID" value={vpa} onChangeText={(t) => { setVpa(t); setErr(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@bank" error={err} autoFocus />
        <TextField label="Payee name (optional)" value={name} onChangeText={setName} placeholder="As you know them" />
        <Text style={[type.caption, { color: colors.textSecondary }]}>Double-check the UPI ID. Your UPI app will show the registered name before you pay.</Text>
        <PrimaryButton label="Continue" onPress={go} size="md" />
      </View>
    </BottomSheet>
  );
}
