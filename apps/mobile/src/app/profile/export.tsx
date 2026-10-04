import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { BottomSheet } from '@/components/Overlays';
import { Screen } from '@/components/Screen';
import { InlineNotice } from '@/components/States';
import { exportCsv, exportJsonBackup, exportPdf } from '@/lib/exporter';
import { startOfMonth } from '@/lib/format';
import { getDb, inTx } from '@/lib/db';
import { expensesSince } from '@/lib/repo';
import { scheduleSync } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';

type Range = 'MONTH' | 'LAST3' | 'ALL';
const LABEL: Record<Range, string> = { MONTH: 'This month', LAST3: 'Last 3 months', ALL: 'All time' };

export default function ExportScreen() {
  const [range, setRange] = useState<Range>('MONTH');
  const [busy, setBusy] = useState<'csv' | 'pdf' | 'json' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  // Import Backup State
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const run = async (kind: 'csv' | 'pdf' | 'json') => {
    setBusy(kind);
    setMsg(null);
    try {
      const now = new Date();
      const from =
        range === 'MONTH'
          ? startOfMonth(now)
          : range === 'LAST3'
          ? new Date(now.getFullYear(), now.getMonth() - 2, 1)
          : null;
      const rows = (await expensesSince(from)).filter((e) => e.status !== 'DRAFT');
      if (!rows.length) {
        setMsg({ tone: 'error', text: 'No expenses in this period to export.' });
        return;
      }
      if (kind === 'csv') await exportCsv(rows);
      else if (kind === 'pdf') await exportPdf(rows, LABEL[range]);
      else await exportJsonBackup(rows);
      setMsg({ tone: 'success', text: `Exported ${rows.length} records.` });
    } catch {
      setMsg({ tone: 'error', text: "Export couldn't be created. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setImportError(null);
    const raw = importJsonText.trim();
    if (!raw) return setImportError('Paste a valid JSON backup string.');

    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.expenses;
      if (!Array.isArray(list) || list.length === 0) {
        return setImportError('Invalid backup: No expenses found in file.');
      }

      setImporting(true);
      const db = await getDb();
      let importedCount = 0;

      await inTx(db, async (tx) => {
        for (const item of list) {
          if (!item.id || !item.amountPaise) continue;
          await tx.runAsync(
            `INSERT OR IGNORE INTO expenses (
              id, expense_code, amount_paise, currency, payee_name, upi_id,
              reason, category, status, payment_method, utr, transaction_reference,
              notes, created_at, expense_date, updated_at, sync_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            item.id,
            item.expenseCode || `EXP-${item.id.slice(0, 6)}`,
            item.amountPaise,
            item.currency || 'INR',
            item.payeeName || null,
            item.upiId || null,
            item.reason || 'Restored Expense',
            item.category || 'Other',
            item.status || 'PAID',
            item.paymentMethod || 'UPI',
            item.utr || null,
            item.transactionReference || null,
            item.notes || null,
            item.createdAt || new Date().toISOString(),
            item.expenseDate || new Date().toISOString(),
            new Date().toISOString(),
          );
          importedCount++;
        }
      });

      scheduleSync();
      setImportModalVisible(false);
      setImportJsonText('');
      setMsg({ tone: 'success', text: `Successfully imported ${importedCount} records.` });
    } catch (err) {
      setImportError('JSON syntax error: could not parse backup.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen back title="Export & Backup">
      <Text style={[type.body]}>
        Export your expense history as CSV or PDF, or download a full JSON backup to restore later.
      </Text>

      <GlassCard padding={space.xl}>
        <Text style={[type.label, { marginBottom: space.md }]}>Period</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {(Object.keys(LABEL) as Range[]).map((r) => (
            <FilterChip key={r} label={LABEL[r]} selected={range === r} onPress={() => setRange(r)} />
          ))}
        </View>
      </GlassCard>

      {msg ? <InlineNotice tone={msg.tone} text={msg.text} /> : null}

      <PrimaryButton
        label="Export CSV Spreadsheet"
        icon="document-text-outline"
        onPress={() => run('csv')}
        loading={busy === 'csv'}
        disabled={!!busy}
      />
      <SecondaryButton
        label="Export PDF Statement"
        icon="document-outline"
        onPress={() => run('pdf')}
        loading={busy === 'pdf'}
        disabled={!!busy}
      />
      <SecondaryButton
        label="Export Full JSON Backup"
        icon="cloud-download-outline"
        variant="ghost"
        onPress={() => run('json')}
        loading={busy === 'json'}
        disabled={!!busy}
      />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.md }} />

      <Text style={type.h3}>Restore From Backup</Text>
      <SecondaryButton
        label="Import JSON Backup File"
        icon="cloud-upload-outline"
        onPress={() => setImportModalVisible(true)}
      />

      {/* Import Modal */}
      <BottomSheet
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        title="Import Backup"
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton
              label="Restore Backup"
              onPress={handleImport}
              loading={importing}
              disabled={importing || !importJsonText.trim()}
            />
            <SecondaryButton label="Cancel" variant="ghost" onPress={() => setImportModalVisible(false)} />
          </View>
        }
      >
        <Text style={[type.caption, { color: colors.textSecondary }]}>
          Paste your exported PayTrack JSON backup text below to restore expenses into this device.
        </Text>
        <TextInput
          style={styles.importInput}
          value={importJsonText}
          onChangeText={(t) => { setImportJsonText(t); setImportError(null); }}
          placeholder='{"format":"PAYTRACK_BACKUP_V1", ...}'
          placeholderTextColor={colors.textMuted}
          multiline
        />
        {importError ? <Text style={[type.caption, { color: colors.error, marginTop: space.xs }]}>{importError}</Text> : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  importInput: {
    backgroundColor: colors.surfaceStrong,
    color: colors.text,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
    height: 140,
    fontSize: 13,
    fontFamily: type.mono.fontFamily,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
