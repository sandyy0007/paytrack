import { useState } from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { exportCsv, exportPdf } from '@/lib/exporter';
import { startOfMonth } from '@/lib/format';
import { expensesSince } from '@/lib/repo';
import { space, type } from '@/theme/tokens';

type Range = 'MONTH' | 'LAST3' | 'ALL';
const LABEL: Record<Range, string> = { MONTH: 'This month', LAST3: 'Last 3 months', ALL: 'All time' };

export default function ExportScreen() {
  const [range, setRange] = useState<Range>('MONTH');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const run = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    setMsg(null);
    try {
      const now = new Date();
      const from = range === 'MONTH' ? startOfMonth(now) : range === 'LAST3' ? new Date(now.getFullYear(), now.getMonth() - 2, 1) : null;
      const rows = (await expensesSince(from)).filter((e) => e.status !== 'DRAFT');
      if (!rows.length) {
        setMsg({ tone: 'error', text: 'No expenses in this period to export.' });
        return;
      }
      if (kind === 'csv') await exportCsv(rows);
      else await exportPdf(rows, LABEL[range]);
      setMsg({ tone: 'success', text: `Exported ${rows.length} records.` });
    } catch {
      setMsg({ tone: 'error', text: "Export couldn't be created. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen back title="Export data">
      <Text style={[type.body]}>Export your expense history with date, time, amount, payee, UPI ID, reason, category, status, UTR and transaction reference.</Text>
      <GlassCard padding={space.xl}>
        <Text style={[type.label, { marginBottom: space.md }]}>Period</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {(Object.keys(LABEL) as Range[]).map((r) => <FilterChip key={r} label={LABEL[r]} selected={range === r} onPress={() => setRange(r)} />)}
        </View>
      </GlassCard>
      {msg ? <InlineNotice tone={msg.tone} text={msg.text} /> : null}
      <PrimaryButton label="Export CSV" icon="document-text-outline" onPress={() => run('csv')} loading={busy === 'csv'} disabled={!!busy} />
      <SecondaryButton label="Export PDF" icon="document-outline" onPress={() => run('pdf')} loading={busy === 'pdf'} disabled={!!busy} />
      <Text style={type.caption}>Files are created on your device and shared through Android's share sheet. CSV cells are protected against spreadsheet formula injection.</Text>
    </Screen>
  );
}
