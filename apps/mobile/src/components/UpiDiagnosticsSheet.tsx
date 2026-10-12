import { buildUpiDiagnostics, type ParamDiffItem, type UpiDiagnosticsReport } from '@paytrack/shared';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SecondaryButton } from './Buttons';
import { GlassCard } from './GlassCard';
import { Icon } from './Icon';
import { BottomSheet } from './Overlays';
import { colors, radius, space, type } from '@/theme/tokens';
import { extractRawQrPayload, getLaunchUri } from '@/lib/payActions';
import type { LocalExpense } from '@/lib/repo';

export function UpiDiagnosticsSheet({
  visible,
  onClose,
  expense,
}: {
  visible: boolean;
  onClose: () => void;
  expense: LocalExpense;
}) {
  const raw = extractRawQrPayload(expense);
  const launchUri = getLaunchUri(expense, false);
  const report: UpiDiagnosticsReport = buildUpiDiagnostics(raw, launchUri, {
    transactionId: expense.transactionId,
    transactionReference: expense.transactionReference,
    approvalReference: expense.approvalReference,
    responseCode: expense.responseCode,
    utr: expense.utr,
    reconciliationStatus: expense.reconciliationStatus,
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="UPI Diagnostic Inspector"
      footer={<SecondaryButton label="Close" onPress={onClose} size="md" />}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}
      >
        {/* Verification Summary Banner */}
        <View
          style={[
            styles.banner,
            report.isZeroAlteration
              ? { backgroundColor: 'rgba(16,227,154,0.12)', borderColor: colors.primary }
              : { backgroundColor: 'rgba(34,211,238,0.12)', borderColor: colors.cyan },
          ]}
        >
          <Icon
            name={report.isZeroAlteration ? 'shield-checkmark' : 'sparkles'}
            size={22}
            color={report.isZeroAlteration ? colors.primary : colors.cyan}
          />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: report.isZeroAlteration ? colors.primary : colors.cyan, fontWeight: '700' }]}>
              {report.flowType === 'ZERO_ALTERATION'
                ? 'ZERO-ALTERATION (100% Exact Match)'
                : report.flowType === 'AUGMENTED'
                ? 'AUGMENTED DYNAMIC QR (Amount Appended)'
                : 'CONSTRUCTED MANUAL INTENT'}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {report.isZeroAlteration
                ? 'Raw QR passed byte-for-byte untouched. Bank signatures and parameter order preserved.'
                : 'Dynamic QR without preset amount: amount appended without duplicating existing parameters.'}
            </Text>
          </View>
        </View>

        {/* Hashes Card */}
        <GlassCard padding={space.md}>
          <Text style={[type.caption, { fontWeight: '700', marginBottom: space.xs }]}>CRYPTOGRAPHIC SHA-256 HASHES</Text>
          <View style={{ gap: space.xs }}>
            <Text style={[type.overline, { color: colors.textSecondary }]}>Raw Scanned QR SHA-256</Text>
            <Text style={[type.mono, { fontSize: 11, color: colors.text }]} selectable>
              {report.rawQrHash ?? 'N/A (Manual Entry)'}
            </Text>

            <Text style={[type.overline, { color: colors.textSecondary, marginTop: space.xs }]}>Final Launched Intent URI SHA-256</Text>
            <Text style={[type.mono, { fontSize: 11, color: colors.text }]} selectable>
              {report.finalLaunchUriHash}
            </Text>

            <Text style={[type.caption, { color: report.isZeroAlteration ? colors.primary : colors.textMuted, marginTop: space.xxs }]}>
              {report.isZeroAlteration ? '✓ SHA-256 hashes match identically (Zero Alteration)' : 'SHA-256 differs (Intended amount was augmented)'}
            </Text>
          </View>
        </GlassCard>

        {/* Intent Details */}
        <GlassCard padding={space.md}>
          <Text style={[type.caption, { fontWeight: '700', marginBottom: space.xs }]}>ANDROID INTENT DISPATCH</Text>
          <View style={{ gap: space.xs }}>
            <Text style={[type.overline, { color: colors.textSecondary }]}>Intent Action</Text>
            <Text style={[type.mono, { fontSize: 12, color: colors.text }]} selectable>{report.intentAction}</Text>

            <Text style={[type.overline, { color: colors.textSecondary, marginTop: space.xs }]}>Raw QR (Masked)</Text>
            <Text style={[type.mono, { fontSize: 11, color: colors.textSecondary }]} selectable>
              {report.rawQrPayload ?? 'None'}
            </Text>

            <Text style={[type.overline, { color: colors.textSecondary, marginTop: space.xs }]}>Launched URI (Masked)</Text>
            <Text style={[type.mono, { fontSize: 11, color: colors.text }]} selectable>
              {report.finalLaunchUri}
            </Text>
          </View>
        </GlassCard>

        {/* Parameter Diff */}
        <GlassCard padding={space.md}>
          <Text style={[type.caption, { fontWeight: '700', marginBottom: space.xs }]}>PARAMETER-BY-PARAMETER COMPARISON</Text>
          <View style={{ gap: space.xs }}>
            {report.paramDiff.map((d: ParamDiffItem) => (
              <View
                key={d.key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 4,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={[type.mono, { width: 64, fontSize: 12, color: colors.text, fontWeight: '700' }]}>{d.key}</Text>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Text style={[type.mono, { fontSize: 11, color: colors.textSecondary }]} numberOfLines={1}>
                    {d.inRaw ?? '(none)'} → {d.inLaunched ?? '(none)'}
                  </Text>
                </View>
                <Text
                  style={[
                    type.caption,
                    {
                      fontSize: 10,
                      fontWeight: '700',
                      color:
                        d.status === 'UNCHANGED'
                          ? colors.primary
                          : d.status === 'ADDED'
                          ? colors.cyan
                          : colors.warning,
                    },
                  ]}
                >
                  {d.status}
                </Text>
              </View>
            ))}
          </View>
        </GlassCard>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
