import { EXPENSE_MODES, formatINR, needsAttention, statusLabel, type SplitData } from '@paytrack/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { EditExpenseSheet } from '@/components/EditExpenseSheet';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { BottomSheet, ConfirmDialog } from '@/components/Overlays';
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
import {
  addManualUtr, addReceipt, deleteExpense, deleteReceipt, getEvents, getExpense,
  listReceipts, setExpenseMode, setExpenseSplit, updateExpenseNotesAndTags, type ReceiptItem,
} from '@/lib/repo';
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
    if (!e) return null;
    const [events, receipts] = await Promise.all([getEvents(id), listReceipts(id)]);
    return { e, events, receipts };
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [splitModal, setSplitModal] = useState(false);

  // UTR Modal state
  const [utrModal, setUtrModal] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);
  const [savingUtr, setSavingUtr] = useState(false);

  // Notes & Tags state
  const [notesText, setNotesText] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  useEffect(() => {
    if (q.data?.e?.notes) {
      setNotesText(q.data.e.notes);
    }
  }, [q.data?.e?.notes]);

  if (q.loading && !q.data) return <Screen back title="Payment"><LoadingState rows={3} /></Screen>;
  if (!q.data) return <Screen back title="Payment"><ErrorState title="Expense not found" message="It may have been deleted." onRetry={() => router.back()} /></Screen>;
  const { e, events, receipts } = q.data;

  const hasUtr = Boolean(e.utr && /^[0-9]{12}$/.test(e.utr));
  const isReconciled = e.reconciliationStatus === 'RECONCILED' || e.reconciliationStatus === 'MATCHED';
  const isManualReconciled = e.reconciliationStatus === 'RECONCILED_MANUAL';

  const handleSaveUtr = async () => {
    const clean = utrInput.trim();
    if (!/^[0-9]{12}$/.test(clean)) {
      setUtrError('Please enter a valid 12-digit numeric UTR/RRN.');
      return;
    }
    setSavingUtr(true);
    setUtrError(null);
    try {
      await addManualUtr(e.id, clean);
      void haptic.success();
      setUtrModal(false);
      setUtrInput('');
    } catch (err) {
      setUtrError(err instanceof Error ? err.message : 'Failed to attach UTR.');
    } finally {
      setSavingUtr(false);
    }
  };

  const handlePickReceipt = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        await addReceipt({
          expenseId: e.id,
          fileUri: asset.uri,
          fileName: asset.fileName || `receipt_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize || 0,
        });
        void haptic.success();
      }
    } catch (err) {
      Alert.alert('Attach Receipt', 'Could not access photo library.');
    }
  };

  const handleAddTag = async () => {
    const clean = newTagInput.trim().replace(/^#/, '');
    if (!clean) return;
    const currentTags = Array.isArray(e.tags) ? [...e.tags] : [];
    if (!currentTags.includes(clean)) {
      const updated = [...currentTags, clean];
      await updateExpenseNotesAndTags(e.id, notesText || null, updated);
      setNewTagInput('');
      setAddingTag(false);
      void haptic.select();
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const currentTags = Array.isArray(e.tags) ? [...e.tags] : [];
    const updated = currentTags.filter((t) => t !== tagToRemove);
    await updateExpenseNotesAndTags(e.id, notesText || null, updated);
    void haptic.select();
  };

  const handleSaveNotes = async () => {
    const currentTags = Array.isArray(e.tags) ? e.tags : null;
    await updateExpenseNotesAndTags(e.id, notesText.trim() || null, currentTags);
    void haptic.select();
  };

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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.md }}>
            <StatusBadge status={e.status} />
            <View
              style={[
                styles.recBadge,
                {
                  backgroundColor: hasUtr
                    ? 'rgba(16, 227, 154, 0.15)'
                    : 'rgba(34, 211, 238, 0.15)',
                  borderColor: hasUtr ? colors.primary : colors.cyan,
                },
              ]}
            >
              <Text style={[type.caption, { color: hasUtr ? colors.primary : colors.cyan, fontWeight: '700' }]}>
                {hasUtr
                  ? isManualReconciled
                    ? '✓ RECONCILED (MANUAL)'
                    : '✓ RECONCILED (AUTO)'
                  : 'USER CONFIRMED'}
              </Text>
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {/* Add UTR Banner if not yet verified */}
      {!hasUtr && e.status === 'PAID' ? (
        <GlassCard padding={space.lg}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: space.md }}>
              <Text style={type.h3}>Bank Reference (UTR)</Text>
              <Text style={type.caption}>Optional: Link 12-digit UTR/RRN to verify settlement.</Text>
            </View>
            <SecondaryButton label="Add UTR" size="md" icon="add-circle-outline" onPress={() => setUtrModal(true)} />
          </View>
        </GlassCard>
      ) : null}

      {needsAttention(e.status) ? (
        <View style={{ gap: space.sm }}>
          <InlineNotice tone="warning" icon="alert-circle-outline" text={`${attentionLabel(e)}. This payment isn't counted as spending until it's confirmed.`} />
          <PrimaryButton label="Complete this record" size="md" onPress={() => router.push(resumeHref(e))} />
        </View>
      ) : null}

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

      {/* Feature H: Transaction Notes & Tags */}
      <GlassCard padding={space.lg}>
        <Text style={type.h3}>Notes & Tags</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm, alignItems: 'center' }}>
          {Array.isArray(e.tags) && e.tags.map((t) => (
            <ScalePressable
              key={t}
              onPress={() => handleRemoveTag(t)}
              style={styles.tagPill}
            >
              <Text style={[type.caption, { color: colors.cyan }]}>#{t} ×</Text>
            </ScalePressable>
          ))}
          {addingTag ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TextInput
                style={styles.tagInput}
                value={newTagInput}
                onChangeText={setNewTagInput}
                placeholder="tag name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                onSubmitEditing={handleAddTag}
              />
              <IconButton icon="checkmark" label="Save" size={18} onPress={handleAddTag} />
              <IconButton icon="close" label="Cancel" size={18} onPress={() => setAddingTag(false)} />
            </View>
          ) : (
            <ScalePressable onPress={() => setAddingTag(true)} style={styles.addTagPill}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>+ Add Tag</Text>
            </ScalePressable>
          )}
        </View>

        <TextInput
          style={styles.notesInput}
          value={notesText}
          onChangeText={setNotesText}
          onBlur={handleSaveNotes}
          placeholder="Add memo or private notes..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
      </GlassCard>

      {/* Feature E: Receipt Vault */}
      <GlassCard padding={space.lg}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="document-text-outline" size={20} color={colors.primary} />
            <View>
              <Text style={type.h3}>Receipt Vault</Text>
              <Text style={type.caption}>{receipts.length} attachment{receipts.length === 1 ? '' : 's'}</Text>
            </View>
          </View>
          <SecondaryButton label="Attach" icon="camera-outline" size="md" variant="ghost" onPress={handlePickReceipt} />
        </View>

        {receipts.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
            {receipts.map((r) => (
              <View key={r.id} style={styles.receiptThumbWrap}>
                <Image source={{ uri: r.fileUri }} style={styles.receiptThumb} />
                <ScalePressable
                  onPress={async () => {
                    await deleteReceipt(r.id);
                    void haptic.select();
                  }}
                  style={styles.receiptDeleteBtn}
                >
                  <Icon name="close" size={12} color="#FFF" />
                </ScalePressable>
              </View>
            ))}
          </View>
        ) : null}
      </GlassCard>

      {/* Technical & Audit Details */}
      <GlassCard padding={space.xl}>
        <Field label="Reason" value={e.reason} />
        <Field label="Category" value={e.category} />
        <Field label="Date" value={fmtDate(e.expenseDate)} />
        <Field label="Time" value={fmtTime(e.expenseDate)} />
        <Field label="Expense Code" value={e.expenseCode} mono copy />
        <Field label="Payment Status" value={statusLabel(e.status)} />
        {e.utr ? <Field label="Bank UTR" value={e.utr} mono copy /> : null}
        {e.transactionId ? <Field label="Transaction ID" value={e.transactionId} mono copy /> : null}
        {e.approvalReference ? <Field label="Approval Ref" value={e.approvalReference} mono copy /> : null}
        {e.transactionReference && e.transactionReference !== e.transactionId ? (
          <Field label="Transaction Ref" value={e.transactionReference} mono copy />
        ) : null}
        <Field label="Reconciliation" value={e.reconciliationStatus ?? 'CONFIRMED_UNRECONCILED'} />
        <Field label="Confirmation Source" value={e.paymentConfirmationSource ?? 'USER_CONFIRMED'} />
        <Field label="Payment App" value={e.paymentApp ?? (e.paymentMethod !== 'UPI' ? e.paymentMethod : 'UPI App')} />
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

      {/* Add UTR Modal */}
      <BottomSheet
        visible={utrModal}
        onClose={() => setUtrModal(false)}
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton
              label="Save UTR"
              loading={savingUtr}
              disabled={utrInput.trim().length !== 12 || savingUtr}
              onPress={handleSaveUtr}
            />
            <SecondaryButton label="Cancel" variant="ghost" onPress={() => setUtrModal(false)} />
          </View>
        }
      >
        <Text style={type.h2}>Link 12-Digit Bank UTR</Text>
        <Text style={[type.caption, { color: colors.textSecondary, marginTop: space.xs }]}>
          Enter the 12-digit UTR / RRN from your bank account or payment receipt.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <TextInput
            style={styles.utrInput}
            value={utrInput}
            onChangeText={(t) => {
              setUtrInput(t.replace(/[^0-9]/g, '').slice(0, 12));
              setUtrError(null);
            }}
            keyboardType="number-pad"
            maxLength={12}
            placeholder="e.g. 427819384729"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          {utrError ? <Text style={[type.caption, { color: colors.error, marginTop: space.xs }]}>{utrError}</Text> : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  recBadge: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(34, 211, 238, 0.12)', borderWidth: 1, borderColor: colors.cyan },
  addTagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.border },
  tagInput: { backgroundColor: colors.surfaceStrong, color: colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, fontSize: 13 },
  notesInput: { marginTop: space.md, backgroundColor: colors.surfaceStrong, color: colors.text, borderRadius: radius.md, padding: space.md, minHeight: 60, fontSize: 14, textAlignVertical: 'top' },
  receiptThumbWrap: { position: 'relative', width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  receiptThumb: { width: '100%', height: '100%', borderRadius: radius.md },
  receiptDeleteBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  utrInput: {
    backgroundColor: colors.surfaceStrong, color: colors.text, fontSize: 18, fontFamily: type.mono.fontFamily, letterSpacing: 2, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: 1, borderColor: colors.borderStrong,
  },
});
