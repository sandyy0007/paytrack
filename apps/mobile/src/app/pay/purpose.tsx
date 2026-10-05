import { CATEGORY_NAME_RE, REASON_MAX, suggestCategory } from '@paytrack/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton } from '@/components/Buttons';
import { CategoryChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { AddCategorySheet } from '@/components/AddCategorySheet';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { useLiveQuery } from '@/lib/dataVersion';
import { haptic } from '@/lib/haptics';
import { run } from '@/lib/payActions';
import { usePayFlow } from '@/lib/payFlow';
import { createExpense, listCategories } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

export default function Purpose() {
  const flow = usePayFlow();
  const { defaultCategory, shareNoteWithPayee, set: setSettings } = useSettings();
  const cats = useLiveQuery(() => listCategories());
  const [reason, setReason] = useState(flow.reason);
  const [category, setCategory] = useState<string | null>(flow.category ?? defaultCategory);
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  // Smart pre-selection from the reason — only until the user picks a category.
  useEffect(() => {
    if (touchedCategory) return;
    const s = suggestCategory(reason);
    if (s) setCategory(s);
  }, [reason, touchedCategory]);

  if (!flow.payload || flow.amountPaise == null) return <Redirect href="/pay" />;
  const payload = flow.payload;
  const amountPaise = flow.amountPaise;

  const submit = async () => {
    const r = reason.trim();
    if (!category || !CATEGORY_NAME_RE.test(category)) { setError('Choose a category.'); return; }
    setBusy(true);
    setError(null);
    try {
      flow.setPurpose(r, category, shareNoteWithPayee);
      // Persist the expense BEFORE any hand-off to a UPI app.
      const e = await run(() => createExpense({
        amountPaise, payeeName: payload.pn ?? null, upiId: payload.pa, reason: r, category, paymentMethod: 'UPI',
        qrSource: flow.qrSource, qrParams: payload.params,
        originalQrPayload: flow.originalQrPayload ?? payload.originalQrPayload ?? null,
      }));
      void haptic.success();
      router.replace({ pathname: '/pay/slip', params: { id: e.id, fresh: '1' } });
    } catch (e) {
      void haptic.error();
      setError(e instanceof Error ? e.message : 'Could not save this expense. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Purpose" keyboard footer={<PrimaryButton label="Create payment slip" icon="receipt-outline" onPress={submit} loading={busy} />}>
      <GlassCard padding={space.lg}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>Paying</Text>
            <Text style={type.bodyStrong} numberOfLines={1}>{payload.pn ?? payload.pa}</Text>
          </View>
          <AmountDisplay paise={amountPaise} size="md" />
        </View>
      </GlassCard>

      <View style={{ gap: space.xs }}>
        <Text style={type.h2} accessibilityRole="header">What is this payment for?</Text>
        <Text style={[type.caption, { color: colors.textSecondary }]}>Optional — add a reason if you want</Text>
        <TextInput
          ref={input}
          value={reason}
          onChangeText={(t) => { setReason(t.slice(0, REASON_MAX)); setError(null); }}
          placeholder="e.g. dinner, rent, project components…"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          autoFocus={false}
          maxLength={REASON_MAX}
          returnKeyType="done"
          accessibilityLabel="Payment reason (optional)"
          style={[styles.reason, { marginTop: space.xs }]}
        />
      </View>

      <View style={{ gap: space.md }}>
        <Text style={type.h3}>Category</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {(cats.data ?? []).map((c) => (
            <CategoryChip key={c.id} name={c.name} icon={c.icon} color={c.color} selected={category === c.name}
              onPress={() => { setCategory(c.name); setTouchedCategory(true); setError(null); }} />
          ))}
          <ScalePressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add custom category" style={styles.addChip}>
            <Icon name="add" size={16} color={colors.primary} />
            <Text style={[styles.addText]}>Custom</Text>
          </ScalePressable>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong}>Add reason as UPI note</Text>
          <Text style={type.caption}>
            {payload.note
              ? 'This QR already has its own note.'
              : !reason.trim()
              ? 'Adds note if a reason is entered.'
              : 'Visible to the payee in their UPI app.'}
          </Text>
        </View>
        <Switch
          value={shareNoteWithPayee && !payload.note}
          disabled={!!payload.note}
          onValueChange={(v) => void setSettings({ shareNoteWithPayee: v })}
          trackColor={{ true: colors.primaryDeep, false: colors.surfaceStrong }}
          thumbColor={shareNoteWithPayee ? colors.primary : colors.textSecondary}
          accessibilityLabel="Add reason as UPI note"
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="time-outline" size={14} color={colors.textMuted} />
        <Text style={type.caption}>Date & time are added automatically.</Text>
      </View>
      {error ? <InlineNotice tone="error" icon="alert-circle-outline" text={error} /> : null}
      <AddCategorySheet visible={adding} onClose={() => setAdding(false)} onAdded={(n) => { setCategory(n); setTouchedCategory(true); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: {
    minHeight: 60, borderRadius: radius.lg, paddingHorizontal: space.lg, backgroundColor: colors.surfaceStrong, color: colors.text,
    fontFamily: fonts.semibold, fontSize: 18, borderWidth: 1, borderColor: colors.borderStrong,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.md, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  addText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
});
