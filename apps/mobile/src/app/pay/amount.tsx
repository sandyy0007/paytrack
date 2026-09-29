import { formatINR, HIGH_AMOUNT_WARNING_PAISE, parseRupeesToPaise, paiseToDecimalString } from '@paytrack/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/Buttons';
import { applyKey, Keypad } from '@/components/Keypad';
import { Avatar } from '@/components/PayeeCard';
import { ConfirmDialog } from '@/components/Overlays';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { usePayFlow } from '@/lib/payFlow';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

const QUICK = [100, 250, 500, 1000];

function trimDecimal(s: string) {
  return s.replace(/\.00$/, '');
}

export default function Amount() {
  const { payload, amountPaise, setAmount } = usePayFlow();
  const [value, setValue] = useState(() => (amountPaise ? trimDecimal(paiseToDecimalString(amountPaise)) : ''));
  const [confirmChange, setConfirmChange] = useState(false);
  if (!payload) return <Redirect href="/pay" />;
  if (payload.amountLocked) return <Redirect href="/pay/purpose" />;

  const parsed = parseRupeesToPaise(value);
  const paise = parsed.ok ? parsed.paise : null;
  let error: string | null = null;
  if (value && !parsed.ok) error = parsed.error === 'TOO_LARGE' ? 'That is above the ₹10,00,000 limit.' : parsed.error === 'TOO_SMALL' ? 'Minimum amount is ₹1.' : 'Enter a valid amount.';
  if (paise != null && payload.minAmountPaise != null && paise < payload.minAmountPaise) error = `This QR requires at least ${formatINR(payload.minAmountPaise)}.`;
  const warn = paise != null && paise >= HIGH_AMOUNT_WARNING_PAISE ? 'Large amount — please double-check. Your bank may apply daily UPI limits.' : null;

  const proceed = () => {
    if (paise == null || error) return;
    setAmount(paise);
    router.push('/pay/purpose');
  };
  const onContinue = () => {
    if (payload.amountPaise != null && paise !== payload.amountPaise) setConfirmChange(true);
    else proceed();
  };

  return (
    <Screen back title="Amount" scroll={false} footer={<PrimaryButton label="Continue" icon="arrow-forward" onPress={onContinue} disabled={paise == null || !!error} />}>
      <View style={styles.payee}>
        <Avatar name={payload.pn} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{payload.pn ?? payload.pa}</Text>
          <Text style={type.caption} numberOfLines={1}>{payload.pa}</Text>
        </View>
      </View>
      <View style={styles.display} accessible accessibilityLabel={`Amount ${value || 'zero'} rupees`} accessibilityLiveRegion="polite">
        <Text style={styles.symbol}>₹</Text>
        <Text style={[styles.amount, !value && { color: colors.textMuted }]} adjustsFontSizeToFit numberOfLines={1}>{value || '0'}</Text>
      </View>
      <Text style={[type.caption, { textAlign: 'center', minHeight: 32, color: error ? colors.error : warn ? colors.warning : colors.textMuted }]}>
        {error ?? warn ?? (payload.amountPaise != null ? `QR amount: ${formatINR(payload.amountPaise)}` : 'Enter the amount to pay')}
      </Text>
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <ScalePressable key={q} onPress={() => setValue(String(q))} hapticStyle="select" accessibilityRole="button" accessibilityLabel={`₹${q}`} style={styles.quickBtn}>
            <Text style={styles.quickText}>₹{q.toLocaleString('en-IN')}</Text>
          </ScalePressable>
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Keypad onKey={(k) => setValue((v) => (k === 'clear' ? '' : applyKey(v, k)))} />
      </View>
      <ConfirmDialog
        visible={confirmChange}
        title="Change the QR amount?"
        message={`The scanned QR requested ${formatINR(payload.amountPaise ?? 0)}. You're about to pay ${formatINR(paise ?? 0)} instead.`}
        confirmLabel={`Pay ${formatINR(paise ?? 0)}`}
        onConfirm={() => { setConfirmChange(false); proceed(); }}
        onCancel={() => setConfirmChange(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  payee: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  display: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', marginTop: space.lg },
  symbol: { fontFamily: fonts.semibold, fontSize: 32, color: colors.textSecondary, marginTop: 10, marginRight: 4 },
  amount: { fontFamily: fonts.extrabold, fontSize: 64, lineHeight: 74, color: colors.text, letterSpacing: -2, fontVariant: ['tabular-nums'], maxWidth: '85%' },
  quick: { flexDirection: 'row', gap: space.sm },
  quickBtn: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  quickText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
