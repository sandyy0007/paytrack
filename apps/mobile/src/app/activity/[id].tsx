import { formatINR, statusLabel } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { EditExpenseSheet } from '@/components/EditExpenseSheet';
import { GlassCard } from '@/components/GlassCard';
import { ConfirmDialog } from '@/components/Overlays';
import { Avatar } from '@/components/PayeeCard';
import { Screen } from '@/components/Screen';
import { ErrorState, InlineNotice, LoadingState, SectionHeader } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Timeline } from '@/components/Timeline';
import { copyText } from '@/lib/clipboard';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate, fmtTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteExpense, getEvents, getExpense } from '@/lib/repo';
import { attentionLabel, resumeHref } from '@/lib/routes';
import { scheduleSync } from '@/lib/sync';
import { colors, space, type } from '@/theme/tokens';
import { needsAttention } from '@paytrack/shared';

function Field({ label, value, copy, mono }: { label: string; value: string | null | undefined; copy?: boolean; mono?: boolean }) {
  const v = value || '—';
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <Text
        style={[mono ? type.mono : type.bodyStrong, { flexShrink: 1, textAlign: 'right' }]}
        selectable
        onLongPress={copy && value ? async () => { await copyText(value); void haptic.success(); } : undefined}
        accessibilityHint={copy && value ? 'Long press to copy' : undefined}
      >
        {v}
      </Text>
    </View>
  );
}

export default function ExpenseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLiveQuery(async () => {
    const e = await getExpense(id);
    return e ? { e, events: await getEvents(id) } : null;
  }, [id]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  if (q.loading && !q.data) return <Screen back title="Payment"><LoadingState rows={3} /></Screen>;
  if (!q.data) return <Screen back title="Payment"><ErrorState title="Expense not found" message="It may have been deleted." onRetry={() => router.back()} /></Screen>;
  const { e, events } = q.data;

  return (
    <Screen back title="Payment details" right={<IconButton icon="create-outline" label="Edit expense" onPress={() => setEdit(true)} />}>
      <Animated.View entering={FadeInDown.duration(350)}>
        <GlassCard variant="hero" padding={space.xl}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar name={e.payeeName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3} numberOfLines={2}>{e.payeeName ?? (e.paymentMethod === 'UPI' ? e.upiId : `${e.paymentMethod.toLowerCase()} payment`)}</Text>
              {e.upiId ? <Text style={type.caption} selectable>{e.upiId}</Text> : null}
            </View>
          </View>
          <View style={{ marginTop: space.lg }}>
            <AmountDisplay paise={e.amountPaise} size="lg" decimals="always" color={e.status === 'PAID' ? colors.text : colors.textSecondary} />
          </View>
          <View style={{ marginTop: space.md }}><StatusBadge status={e.status} /></View>
        </GlassCard>
      </Animated.View>

      {needsAttention(e.status) ? (
        <View style={{ gap: space.sm }}>
          <InlineNotice tone="warning" icon="alert-circle-outline" text={`${attentionLabel(e)}. This payment isn't counted as spending until it's confirmed with a reference.`} />
          <PrimaryButton label="Complete this record" size="md" onPress={() => router.push(resumeHref(e))} />
        </View>
      ) : null}
      {e.syncState === 'error' ? <InlineNotice tone="warning" icon="cloud-offline-outline" text={`Not synced: ${e.syncError ?? 'the server rejected this change'}. It's still saved on this device.`} /> : null}

      <GlassCard padding={space.xl}>
        <Field label="Reason" value={e.reason} />
        <Field label="Category" value={e.category} />
        <Field label="Date" value={fmtDate(e.expenseDate)} />
        <Field label="Time" value={fmtTime(e.expenseDate)} />
        <Field label="Expense ID" value={e.expenseCode} mono copy />
        <Field label="Payment status" value={statusLabel(e.status)} />
        <Field label="UTR" value={e.utr} mono copy />
        <Field label="Transaction reference" value={e.transactionReference} mono copy />
        <Field label="Payment app" value={e.paymentApp ?? (e.paymentMethod !== 'UPI' ? e.paymentMethod : null)} />
        {e.notes ? <Field label="Notes" value={e.notes} /> : null}
        {e.qrSource !== 'NONE' ? <Text style={[type.caption, { marginTop: space.md }]}>Payee details {e.qrSource === 'MANUAL_UPI' ? 'entered manually' : 'read from scanned QR'} — not verified by PayTrack.</Text> : null}
      </GlassCard>

      <SectionHeader title="Timeline" />
      <GlassCard padding={space.xl}>
        <Timeline events={events} />
      </GlassCard>

      <SecondaryButton label="Delete expense" icon="trash-outline" variant="danger" size="md" onPress={() => setDel(true)} />
      <EditExpenseSheet expense={edit ? e : null} onClose={() => setEdit(false)} />
      <ConfirmDialog
        visible={del}
        title="Delete this expense?"
        message={`${formatINR(e.amountPaise)} will be removed from your records. This doesn't reverse or affect the actual payment.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDel(false)}
        onConfirm={async () => { await deleteExpense(e.id); scheduleSync(); setDel(false); router.back(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
