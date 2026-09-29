import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { register } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { colors, space, type } from '@/theme/tokens';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (phone.trim() && !/^\+?[0-9]{10,15}$/.test(phone.trim())) e.phone = 'Enter 10–15 digits, optionally starting with +.';
    if (password.length < 8) e.password = 'Use at least 8 characters.';
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await register(name, email, password, phone);
      void haptic.success();
      router.replace('/home');
    } catch (err) {
      void haptic.error();
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back keyboard title="Create account">
      <Text style={[type.body, { color: colors.textSecondary }]}>Your expenses sync securely across devices. PayTrack never asks for your UPI PIN or bank details.</Text>
      <GlassCard padding={space.xl}>
        <View style={{ gap: space.lg }}>
          <TextField label="Name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} placeholder="Your name" />
          <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} placeholder="you@example.com" />
          <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={errors.phone} placeholder="+91 98765 43210" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={errors.password} hint="At least 8 characters" />
          {formError ? <InlineNotice tone="error" icon="alert-circle-outline" text={formError} /> : null}
          <PrimaryButton label="Create account" onPress={submit} loading={busy} />
        </View>
      </GlassCard>
    </Screen>
  );
}
