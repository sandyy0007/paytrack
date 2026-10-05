import { CATEGORY_NAME_RE, REASON_MAX } from '@paytrack/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLiveQuery } from '@/lib/dataVersion';
import { pickDate } from '@/lib/datePicker';
import { fmtDate } from '@/lib/format';
import { listCategories, updateExpense, type LocalExpense } from '@/lib/repo';
import { scheduleSync } from '@/lib/sync';
import { colors, space, type } from '@/theme/tokens';
import { PrimaryButton, SecondaryButton } from './Buttons';
import { CategoryChip } from './CategoryChip';
import { BottomSheet } from './Overlays';
import { InlineNotice } from './States';
import { TextField } from './TextField';

/** Edits descriptive fields only. Amount, payee and UPI ID are frozen once a payment is prepared. */
export function EditExpenseSheet({ expense, onClose }: { expense: LocalExpense | null; onClose: () => void }) {
  const cats = useLiveQuery(() => listCategories());
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expense) return;
    setReason(expense.reason);
    setCategory(expense.category);
    setNotes(expense.notes ?? '');
    setDate(new Date(expense.expenseDate));
    setErr(null);
  }, [expense]);

  const save = async () => {
    if (!expense) return;
    if (!CATEGORY_NAME_RE.test(category)) return setErr('Choose a category.');
    setBusy(true);
    try {
      const orig = new Date(expense.expenseDate);
      const nd = new Date(date);
      nd.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds());
      await updateExpense(expense.id, {
        reason: reason.trim(), category, notes: notes.trim() || null,
        ...(nd.toDateString() !== orig.toDateString() ? { expenseDate: nd.toISOString() } : {}),
      });
      scheduleSync();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={!!expense} onClose={onClose} title="Edit expense">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.lg }}>
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={REASON_MAX} />
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Category</Text>
          <View style={styles.chips}>
            {(cats.data ?? []).map((c) => <CategoryChip key={c.id} name={c.name} icon={c.icon} color={c.color} selected={category === c.name} onPress={() => setCategory(c.name)} />)}
          </View>
        </View>
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={500} multiline style={{ minHeight: 80, paddingTop: 14, textAlignVertical: 'top' }} />
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Expense date</Text>
          <SecondaryButton label={fmtDate(date)} icon="calendar-outline" size="md" onPress={async () => { const d = await pickDate(date, { max: new Date() }); if (d) setDate(d); }} />
          <Text style={type.caption}>Captured automatically at payment time; change only if needed. Amount, payee and UPI ID can't be edited.</Text>
        </View>
        {err ? <InlineNotice tone="error" text={err} /> : null}
        <PrimaryButton label="Save changes" onPress={save} loading={busy} size="md" />
        <Text style={[type.caption, { color: colors.textMuted, textAlign: 'center' }]}>{expense?.expenseCode}</Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
