import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { copyText } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { getExpense, listExpenses, type LocalExpense } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { colors, space, type } from '@/theme/tokens';

function DebugRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.caption, { color: colors.textSecondary, fontFamily: 'monospace' }]} selectable>
        {value ?? '—'}
      </Text>
    </View>
  );
}

export default function PayDebug() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [expense, setExpense] = useState<LocalExpense | null>(null);
  const [recent, setRecent] = useState<LocalExpense[]>([]);
  const [copied, setCopied] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    if (id) {
      void getExpense(id).then(setExpense);
    }
    void listExpenses({ limit: 5 }).then(setRecent);
  }, [id]);

  const copyDiagnosticDump = async () => {
    const dump = {
      app: 'PayTrack Mobile',
      timestamp: new Date().toISOString(),
      activeExpense: expense,
      recentCount: recent.length,
      settings: {
        preferredUpiPackage: settings.preferredUpiPackage,
        activeMode: settings.activeMode,
        apiUrlOverride: settings.apiUrlOverride,
      },
    };
    await copyText(JSON.stringify(dump, null, 2));
    setCopied(true);
    void haptic.success();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen
      back={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      title="Payment Diagnostics"
      footer={
        <PrimaryButton
          label={copied ? 'DIAGNOSTICS COPIED' : 'COPY DIAGNOSTIC DUMP'}
          icon={copied ? 'checkmark' : 'copy-outline'}
          onPress={copyDiagnosticDump}
        />
      }
    >
      <Text style={[type.body, { color: colors.textSecondary, marginBottom: space.md }]}>
        Diagnostic information for payment intent reconciliation, UPI intents, and local storage state.
      </Text>

      {expense ? (
        <GlassCard padding={space.lg}>
          <Text style={[type.h3, { marginBottom: space.sm }]}>Active Expense</Text>
          <DebugRow label="ID" value={expense.id} />
          <DebugRow label="Expense Code" value={expense.expenseCode} />
          <DebugRow label="Status" value={expense.status} />
          <DebugRow label="Amount (Paise)" value={String(expense.amountPaise)} />
          <DebugRow label="Payee Name" value={expense.payeeName} />
          <DebugRow label="UPI ID" value={expense.upiId} />
          <DebugRow label="Transaction ID" value={expense.transactionId} />
          <DebugRow label="Approval Ref" value={expense.approvalReference} />
          <DebugRow label="UTR / RRN" value={expense.utr} />
          <DebugRow label="Reconciliation" value={expense.reconciliationStatus} />
          <DebugRow label="Confidence" value={expense.confidenceLevel} />
          <DebugRow label="Mode" value={expense.mode} />
          <DebugRow label="Sync State" value={expense.syncState} />
        </GlassCard>
      ) : null}

      <View style={{ marginTop: space.md }}>
        <GlassCard padding={space.lg}>
          <Text style={[type.h3, { marginBottom: space.sm }]}>System Environment</Text>
          <DebugRow label="Engine" value="PayTrack Dual-Verification V2" />
          <DebugRow label="Storage" value="SQLite WAL + SecureStore" />
          <DebugRow label="Preferred UPI App" value={settings.preferredUpiPackage ?? 'System Chooser'} />
          <DebugRow label="Active Mode" value={settings.activeMode} />
          <DebugRow label="Recent Expenses Loaded" value={String(recent.length)} />
        </GlassCard>
      </View>

      <View style={{ marginTop: space.md, marginBottom: space.xl }}>
        <SecondaryButton
          label="Back to Home"
          size="md"
          variant="ghost"
          onPress={() => router.replace('/home')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});

