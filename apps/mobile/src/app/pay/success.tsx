import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AmountDisplay } from '@/components/AmountDisplay';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { BottomSheet } from '@/components/Overlays';
import { Screen } from '@/components/Screen';
import { LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { SuccessCheck } from '@/components/SuccessCheck';
import { copyText } from '@/lib/clipboard';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate, fmtTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { checkBudgetAlerts } from '@/lib/notifications';
import { usePayFlow } from '@/lib/payFlow';
import { addManualUtr, getExpense } from '@/lib/repo';
import { colors, radius, space, type } from '@/theme/tokens';

function Row({ k, v, copy }: { k: string; v: string; copy?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={type.label}>{k}</Text>
      <Text
        style={[type.bodyStrong, { flexShrink: 1, textAlign: 'right' }]}
        selectable
        onLongPress={copy ? async () => { await copyText(v); void haptic.success(); } : undefined}
      >
        {v}
      </Text>
    </View>
  );
}

export default function Success() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLiveQuery(() => getExpense(id), [id]);
  const reset = usePayFlow((s) => s.reset);
  const [utrModalVisible, setUtrModalVisible] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);
  const [savingUtr, setSavingUtr] = useState(false);

  useEffect(() => {
    reset();
    void checkBudgetAlerts();
  }, [reset]);

  const e = q.data;
  if (!e) return <Screen><LoadingState rows={2} /></Screen>;

  const when = e.paymentCompletedAt ?? e.updatedAt;
  const hasUtr = Boolean(e.utr && /^[0-9]{12}$/.test(e.utr));
  const isLent = e.financialType === 'LENT';
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
      setUtrModalVisible(false);
      setUtrInput('');
    } catch (err) {
      setUtrError(err instanceof Error ? err.message : 'Failed to attach UTR.');
    } finally {
      setSavingUtr(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label={isLent ? 'VIEW IN UDHAAR' : 'DONE'}
            onPress={() => (isLent ? router.replace('/udhaar') : router.replace('/home'))}
          />
          <SecondaryButton
            label={isLent ? 'GO TO HOME' : 'VIEW EXPENSE DETAILS'}
            size="md"
            onPress={() =>
              isLent ? router.replace('/home') : router.replace({ pathname: '/activity/[id]', params: { id: e.id } })
            }
          />
          {!hasUtr && !isLent ? (
            <SecondaryButton
              label="Add bank UTR (Optional)"
              size="md"
              variant="ghost"
              onPress={() => setUtrModalVisible(true)}
            />
          ) : null}
        </>
      }
    >
      <View style={{ alignItems: 'center', marginTop: space.lg }}>
        <SuccessCheck />
        <Animated.Text
          entering={FadeInDown.delay(200)}
          style={[type.h1, { marginTop: -space.lg, textAlign: 'center' }]}
          accessibilityRole="header"
        >
          {isLent
            ? 'Money Lent Recorded'
            : hasUtr
            ? 'Payment Reconciled'
            : 'Payment Recorded'}
        </Animated.Text>
        <Text
          style={[
            type.caption,
            {
              color: hasUtr ? colors.primary : colors.cyan,
              marginTop: space.xs,
              textAlign: 'center',
            },
          ]}
        >
          {isLent
            ? 'Tracked under Udhaar. Excluded from monthly expense totals.'
            : hasUtr
            ? isManualReconciled
              ? 'Reconciled with your manual 12-digit bank reference.'
              : 'Auto-reconciled with 12-digit bank UTR.'
            : 'Saved successfully. Bank UTR is optional and can be added anytime.'}
        </Text>
        <Animated.View entering={FadeInDown.delay(300)} style={{ marginTop: space.md }}>
          <AmountDisplay paise={e.amountPaise} size="lg" />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(400)} style={{ marginTop: space.md }}>
        <GlassCard padding={space.xl}>
          <View style={styles.badgeRow}>
            <Text style={type.label}>Reconciliation</Text>
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
              <Text
                style={[
                  type.caption,
                  {
                    color: hasUtr ? colors.primary : colors.cyan,
                    fontWeight: '700',
                  },
                ]}
              >
                {hasUtr
                  ? isManualReconciled
                    ? '✓ RECONCILED (MANUAL UTR)'
                    : '✓ RECONCILED (AUTO)'
                  : 'USER CONFIRMED (UNRECONCILED)'}
              </Text>
            </View>
          </View>

          {isLent ? <Row k="Type" v="Money Lent (Udhaar)" /> : null}
          <Row k="Payee Name" v={e.payeeName ?? '—'} />
          <Row k="Payee UPI ID" v={e.upiId ?? '—'} copy />
          <Row k="Purpose / Category" v={`${e.reason} · ${e.category}`} />
          {e.utr ? <Row k="Bank UTR" v={e.utr} copy /> : null}
          {e.transactionId ? <Row k="Transaction ID" v={e.transactionId} copy /> : null}
          {e.approvalReference && !e.utr ? <Row k="Approval Ref" v={e.approvalReference} copy /> : null}
          <Row k="Expense Code" v={e.expenseCode} copy />
          <Row k="Date" v={fmtDate(when)} />
          <Row k="Time" v={fmtTime(when)} />
        </GlassCard>
      </Animated.View>

      {/* Add UTR Modal */}
      <BottomSheet
        visible={utrModalVisible}
        onClose={() => setUtrModalVisible(false)}
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton
              label="Save UTR"
              loading={savingUtr}
              disabled={utrInput.trim().length !== 12 || savingUtr}
              onPress={handleSaveUtr}
            />
            <SecondaryButton
              label="Cancel"
              variant="ghost"
              onPress={() => setUtrModalVisible(false)}
            />
          </View>
        }
      >
        <Text style={type.h2}>Add 12-Digit Bank UTR</Text>
        <Text style={[type.caption, { color: colors.textSecondary, marginTop: space.xs }]}>
          Enter the 12-digit UTR/RRN from your bank statement or SMS receipt to verify this payment.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <TextInput
            style={styles.input}
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
          {utrError ? (
            <Text style={[type.caption, { color: colors.error, marginTop: space.xs }]}>
              {utrError}
            </Text>
          ) : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.sm },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm },
  recBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  input: {
    backgroundColor: colors.surfaceStrong,
    color: colors.text,
    fontSize: 18,
    fontFamily: type.mono.fontFamily,
    letterSpacing: 2,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
