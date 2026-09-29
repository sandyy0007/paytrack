import { classifyReference } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { suggestUtrFromClipboard } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { run } from '@/lib/payActions';
import { getExpense, LocalDuplicateReferenceError, saveReference } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

export default function Utr() {
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();
  const clipboardOn = useSettings((s) => s.clipboardSuggestions);
  const [value, setValue] = useState('');
  const [suggestion, setSuggestion] = useState<{ value: string; source: 'app' | 'clipboard' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await getExpense(id);
      if (e?.status === 'PAID') return router.replace({ pathname: '/pay/success', params: { id } });
      const fromApp = ref ? classifyReference(ref) : null;
      if (fromApp?.ok) return setSuggestion({ value: fromApp.value, source: 'app' });
      if (clipboardOn) {
        // One-time read when this screen opens; never stored or uploaded unless you confirm.
        const c = await suggestUtrFromClipboard();
        if (c) setSuggestion({ value: c, source: 'clipboard' });
      }
    })();
  }, [id, ref, clipboardOn]);

  const check = classifyReference(value);
  const save = async (v = value) => {
    const r = classifyReference(v);
    if (!r.ok) {
      setError(r.message);
      void haptic.error();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await run(() => saveReference(id, r.value));
      void haptic.success();
      router.replace({ pathname: '/pay/success', params: { id } });
    } catch (e) {
      void haptic.error();
      setError(e instanceof LocalDuplicateReferenceError ? 'Transaction ID already exists.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back={() => router.replace('/home')} title="Transaction reference" keyboard footer={
      <>
        <PrimaryButton label="Save Payment" icon="checkmark" onPress={() => save()} loading={busy} disabled={!value.trim()} />
        <SecondaryButton label="Add it later" variant="ghost" size="md" onPress={() => router.replace('/home')} accessibilityHint="Keeps this payment marked as UTR missing" />
      </>
    }>
      <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space.sm }}>
        <Text style={type.h1} accessibilityRole="header">Enter UTR / Transaction ID</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>Find it in your UPI app's payment details — often labelled “UPI Ref No.” or “UTR” (12 digits).</Text>
      </Animated.View>

      {suggestion && suggestion.value !== value ? (
        <Animated.View entering={FadeInDown.delay(80)}>
          <GlassCard variant="hero" padding={space.lg}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name={suggestion.source === 'app' ? 'phone-portrait-outline' : 'clipboard-outline'} size={18} color={colors.primary} />
              <Text style={[type.bodyStrong, { flex: 1 }]}>
                {suggestion.source === 'app' ? 'Reference reported by your UPI app' : 'We found a possible transaction ID.'}
              </Text>
            </View>
            <Text style={[styles.suggest]} selectable>{suggestion.value}</Text>
            <PrimaryButton label="USE THIS" size="md" onPress={() => { setValue(suggestion.value); setError(null); void haptic.select(); }} />
            <Text style={[type.caption, { marginTop: space.sm }]}>Please check it matches your UPI app before saving.</Text>
          </GlassCard>
        </Animated.View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <TextInput
          value={value}
          onChangeText={(t) => { setValue(t.toUpperCase()); setError(null); }}
          placeholder="e.g. 627012345678"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType="default"
          maxLength={40}
          accessibilityLabel="UTR or transaction ID"
          style={[styles.input, !!error && { borderColor: colors.error }, check.ok && { borderColor: colors.primary }]}
          onSubmitEditing={() => save()}
          returnKeyType="done"
        />
        {value && check.ok ? (
          <Text style={[type.caption, { color: colors.primary }]}>{check.kind === 'UTR' ? '✓ Looks like a 12-digit UPI UTR' : '✓ Looks like a transaction ID'}</Text>
        ) : null}
        {error ? <InlineNotice tone="error" icon="alert-circle-outline" text={error} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 64, borderRadius: radius.lg, paddingHorizontal: space.lg, backgroundColor: colors.surfaceStrong, borderWidth: 1.5,
    borderColor: colors.borderStrong, color: colors.text, fontFamily: fonts.bold, fontSize: 22, letterSpacing: 2,
  },
  suggest: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: 2, color: colors.text, marginVertical: space.md },
});
