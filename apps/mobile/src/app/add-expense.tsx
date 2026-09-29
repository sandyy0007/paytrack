import { CATEGORY_NAME_RE, parseRupeesToPaise, REASON_MAX, suggestCategory, type PaymentMethod } from '@paytrack/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { CategoryChip, FilterChip } from '@/components/CategoryChip';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useLiveQuery } from '@/lib/dataVersion';
import { pickDate } from '@/lib/datePicker';
import { fmtDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { checkBudgetAlerts } from '@/lib/notifications';
import { createExpense, listCategories } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { scheduleSync } from '@/lib/sync';
import { space, type } from '@/theme/tokens';

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'CASH', label: 'Cash' }, { key: 'CARD', label: 'Card' }, { key: 'BANK_TRANSFER', label: 'Bank transfer' }, { key: 'OTHER', label: 'Other' },
];

/** Manual record for payments made outside UPI (cash, card…). UPI payments go through + PAY. */
export default function AddExpense() {
  const defaultCategory = useSettings((s) => s.defaultCategory);
  const cats = useLiveQuery(() => listCategories());
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string | null>(defaultCategory);
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(new Date());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!touched) {
      const s = suggestCategory(reason);
      if (s) setCategory(s);
    }
  }, [reason, touched]);

  const save = async () => {
    const a = parseRupeesToPaise(amount);
    if (!a.ok) return setErr('Enter a valid amount (₹1 – ₹10,00,000).');
    if (!reason.trim()) return setErr('Add what this was for.');
    if (!category || !CATEGORY_NAME_RE.test(category)) return setErr('Choose a category.');
    setBusy(true);
    try {
      const now = new Date();
      const when = new Date(date);
      when.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      await createExpense({
        amountPaise: a.paise, payeeName: payee.trim() || null, upiId: null, reason, category, paymentMethod: method,
        qrSource: 'NONE', qrParams: null, expenseDate: when.toDateString() === now.toDateString() ? undefined : when.toISOString(),
      });
      scheduleSync();
      void checkBudgetAlerts();
      void haptic.success();
      router.back();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Add Expense" keyboard footer={<PrimaryButton label="Save expense" icon="checkmark" onPress={save} loading={busy} />}>
      <InlineNotice icon="information-circle-outline" text="For cash or card payments. Paying by UPI? Use + PAY so the record is created with the payment." />
      <TextField label="Amount (₹)" value={amount} onChangeText={(t) => { setAmount(t); setErr(null); }} keyboardType="decimal-pad" placeholder="0" autoFocus style={{ fontSize: 28, height: 64 }} />
      <TextField label="What was it for?" value={reason} onChangeText={(t) => setReason(t.slice(0, REASON_MAX))} placeholder="e.g. tea, auto fare" />
      <TextField label="Paid to (optional)" value={payee} onChangeText={setPayee} placeholder="Shop or person" maxLength={100} />
      <View style={{ gap: space.sm }}>
        <Text style={type.label}>Paid by</Text>
        <View style={styles.wrap}>{METHODS.map((m) => <FilterChip key={m.key} label={m.label} selected={method === m.key} onPress={() => setMethod(m.key)} />)}</View>
      </View>
      <View style={{ gap: space.sm }}>
        <Text style={type.label}>Category</Text>
        <View style={styles.wrap}>
          {(cats.data ?? []).map((c) => <CategoryChip key={c.id} name={c.name} icon={c.icon} color={c.color} selected={category === c.name} onPress={() => { setCategory(c.name); setTouched(true); }} />)}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Text style={type.label}>Date</Text>
        <SecondaryButton label={date.toDateString() === new Date().toDateString() ? `Today · ${fmtDate(date)}` : fmtDate(date)} icon="calendar-outline" size="md"
          onPress={async () => { const d = await pickDate(date, { max: new Date() }); if (d) setDate(d); }} />
      </View>
      {err ? <InlineNotice tone="error" text={err} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
