import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { TextField } from '@/components/TextField';
import { ServerSettingsSheet } from '@/components/ServerSettingsSheet';
import { ApiError } from '@/lib/api';
import { continueLocally, login } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { colors, space, type } from '@/theme/tokens';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    try {
      await login(email, password);
      void haptic.success();
      router.replace('/home');
    } catch (e) {
      void haptic.error();
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard contentStyle={{ paddingTop: space.huge }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space.sm }}>
        <Text style={[type.overline, { color: colors.primary }]}>PayTrack</Text>
        <Text style={type.h1} accessibilityRole="header">Welcome back</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>Pay First. Track Automatically.</Text>
      </Animated.View>
      <GlassCard padding={space.xl}>
        <View style={{ gap: space.lg }}>
          <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
          <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••••" onSubmitEditing={submit} returnKeyType="go" />
          {error ? <InlineNotice tone="error" icon="alert-circle-outline" text={error} /> : null}
          <PrimaryButton label="Sign in" onPress={submit} loading={busy} />
        </View>
      </GlassCard>
      <Text style={[type.body, { textAlign: 'center', color: colors.textSecondary }]}>
        New to PayTrack? <Link href="/register" style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Create an account</Link>
      </Text>
      <SecondaryButton label="Continue without an account" variant="ghost" icon="phone-portrait-outline" onPress={async () => { await continueLocally('there'); router.replace('/home'); }} accessibilityHint="Keeps all data on this device only. You can sign in later to sync." />
      <Text style={[type.caption, { textAlign: 'center' }]} onPress={() => setServer(true)} accessibilityRole="button">Server settings</Text>
      <ServerSettingsSheet visible={server} onClose={() => setServer(false)} />
    </Screen>
  );
}
