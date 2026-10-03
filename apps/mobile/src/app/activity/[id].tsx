import { EXPENSE_MODES, formatINR, needsAttention, statusLabel, type SplitData } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { EditExpenseSheet } from '@/components/EditExpenseSheet';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { ConfirmDialog } from '@/components/Overlays';
import { Avatar } from '@/components/PayeeCard';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { SplitExpenseModal } from '@/components/SplitExpenseModal';
import { ErrorState, InlineNotice, LoadingState, SectionHeader } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Timeline } from '@/components/Timeline';
import { copyText } from '@/lib/clipboard';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate, fmtTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteExpense, getEvents, getExpense, setExpenseMode, setExpenseSplit } from '@/lib/repo';
import { attentionLabel, resumeHref } from '@/lib/routes';
import { scheduleSync } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';

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
  const [splitModal, setSplitModal] = useState(false);

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

      {/* Mode Selector */}
      <GlassCard padding={space.lg}>
        <Text style={[type.label, { marginBottom: space.xs }]}>Expense Mode</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {EXPENSE_MODES.map((m) => {
            const active = (e.mode ?? 'Personal') === m;
            return (
              <ScalePressable
                key={m}
                onPress={() => setExpenseMode(e.id, m)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.bgElevated,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={[type.caption, { color: active ? colors.onPrimary : colors.text, fontWeight: active ? '700' : '500' }]}>
                  {m}
                </Text>
              </ScalePressable>
            );
          })}
        </View>
      </GlassCard>

      {/* Split Expense */}
      <GlassCard padding={space.lg}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="people-outline" size={20} color={colors.primary} />
            <View>
              <Text style={type.h3}>Split Expense</Text>
              <Text style={type.caption}>
                {e.splitData ? `${e.splitData.totalShares}-way split (${e.splitData.shares.filter((s) => s.isPaid).length}/${e.splitData.totalShares} settled)` : 'Divide this payment with others'}
              </Text>
            </View>
          </View>
          <SecondaryButton
            label={e.splitData ? 'Manage' : 'Split'}
            variant="ghost"
            size="md"
            onPress={() => setSplitModal(true)}
          />
        </View>

        {e.splitData && (
          <View style={{ marginTop: space.sm, gap: space.xs }}>
            {e.splitData.shares.map((share) => (
              <View key={share.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                <Text style={type.body}>{share.personName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={type.bodyStrong}>{formatINR(share.amountPaise)}</Text>
                  <Text style={[type.caption, { color: share.isPaid ? colors.primary : colors.warning }]}>
                    {share.isPaid ? '✓ Settled' : 'Unpaid'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </GlassCard>

      <GlassCard padding={space.xl}>
        <Field label="Reason" value={e.reason} />
        <Field label="Category" value={e.category} />
        <Field label="Date" value={fmtDate(e.expenseDate)} />
        <Field label="Time" value={fmtTime(e.expenseDate)} />
        <Field label="Expense ID" value={e.expenseCode} mono copy />
        <Field label="Payment status" value={statusLabel(e.status)} />
        <Field label="UTR" value={e.utr} mono copy />
        <Field label="Transaction reference" value={e.transactionReference} mono copy />
        {e.transactionId ? <Field label="Transaction ID" value={e.transactionId} mono copy /> : null}
        {e.approvalReference ? <Field label="Approval ref" value={e.approvalReference} mono copy /> : null}
        <Field label="Reconciliation" value={e.reconciliationStatus ?? (e.status === 'PAID' ? 'MATCHED' : 'UNRECONCILED')} />
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
      <SplitExpenseModal
        visible={splitModal}
        totalAmountPaise={e.amountPaise}
        currentSplit={e.splitData ?? null}
        onClose={() => setSplitModal(false)}
        onSave={async (split: SplitData | null) => {
          await setExpenseSplit(e.id, split);
          scheduleSync();
        }}
      />
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
