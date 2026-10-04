import { formatINR, parseRupeesToPaise, paiseToDecimalString, type Loan } from '@paytrack/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { BottomSheet, ConfirmDialog } from '@/components/Overlays';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { EmptyState, InlineNotice, LoadingState } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useLiveQuery } from '@/lib/dataVersion';
import { fmtDate } from '@/lib/format';
import { createLoan, deleteLoan, getUdhaarSummary, listLoans, recordLoanRepayment, settleLoan } from '@/lib/repo';
import { scheduleSync } from '@/lib/sync';
import { colors, elevation, radius, space, type } from '@/theme/tokens';

type FilterType = 'ALL' | 'LENT' | 'BORROWED' | 'SETTLED';

export default function UdhaarScreen() {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [repayingLoan, setRepayingLoan] = useState<Loan | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null);

  // Form state for adding loan
  const [addPersonName, setAddPersonName] = useState('');
  const [addPersonContact, setAddPersonContact] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDirection, setAddDirection] = useState<'LENT' | 'BORROWED'>('LENT');
  const [addNotes, setAddNotes] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Form state for repayment
  const [repayAmount, setRepayAmount] = useState('');
  const [repayNotes, setRepayNotes] = useState('');
  const [repayErr, setRepayErr] = useState<string | null>(null);
  const [repayBusy, setRepayBusy] = useState(false);

  const data = useLiveQuery(async () => {
    const [loans, summary] = await Promise.all([listLoans(), getUdhaarSummary()]);
    return { loans, summary };
  });

  const allLoans = data.data?.loans ?? [];
  const summary = data.data?.summary ?? {
    totalLentPendingPaise: 0,
    totalBorrowedPendingPaise: 0,
    totalLentSettledPaise: 0,
    totalBorrowedSettledPaise: 0,
    activeLentCount: 0,
    activeBorrowedCount: 0,
  };

  const filteredLoans = allLoans.filter((l) => {
    if (filter === 'SETTLED') return l.status === 'SETTLED';
    if (filter === 'LENT') return l.direction === 'LENT' && l.status !== 'SETTLED';
    if (filter === 'BORROWED') return l.direction === 'BORROWED' && l.status !== 'SETTLED';
    return l.status !== 'SETTLED';
  });

  const netPending = summary.totalLentPendingPaise - summary.totalBorrowedPendingPaise;

  const handleCreateLoan = async () => {
    Keyboard.dismiss();
    if (!addPersonName.trim()) return setAddErr('Please enter the person name.');
    const a = parseRupeesToPaise(addAmount);
    if (!a.ok || a.paise <= 0) return setAddErr('Enter a valid amount (> ₹0).');
    setAddBusy(true);
    try {
      await createLoan({
        personName: addPersonName.trim(),
        personContact: addPersonContact.trim() || null,
        direction: addDirection,
        amountPaise: a.paise,
        originalAmountPaise: a.paise,
        notes: addNotes.trim() || null,
        dueDate: addDueDate.trim() || null,
      });
      scheduleSync();
      setIsAddOpen(false);
      setAddPersonName('');
      setAddPersonContact('');
      setAddAmount('');
      setAddNotes('');
      setAddDueDate('');
      setAddErr(null);
    } catch (e) {
      setAddErr((e as Error).message);
    } finally {
      setAddBusy(false);
    }
  };

  const handleRecordRepayment = async () => {
    if (!repayingLoan) return;
    Keyboard.dismiss();
    const a = parseRupeesToPaise(repayAmount);
    if (!a.ok || a.paise <= 0) return setRepayErr('Enter a valid repayment amount (> ₹0).');
    if (a.paise > repayingLoan.remainingAmountPaise) {
      return setRepayErr(`Repayment cannot exceed remaining ${formatINR(repayingLoan.remainingAmountPaise)}.`);
    }
    setRepayBusy(true);
    try {
      await recordLoanRepayment(repayingLoan.id, a.paise, repayNotes.trim() || undefined);
      scheduleSync();
      setRepayingLoan(null);
      setRepayAmount('');
      setRepayNotes('');
      setRepayErr(null);
    } catch (e) {
      setRepayErr((e as Error).message);
    } finally {
      setRepayBusy(false);
    }
  };

  const handleSettle = async (loan: Loan) => {
    try {
      await settleLoan(loan.id);
      scheduleSync();
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!deletingLoan) return;
    try {
      await deleteLoan(deletingLoan.id);
      scheduleSync();
      setDeletingLoan(null);
    } catch {
      // ignore
    }
  };

  return (
    <Screen
      title="Udhaar"
      subtitle="Lend & Borrow Tracker"
      back={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      right={<IconButton icon="add" label="Add Udhaar" onPress={() => setIsAddOpen(true)} color={colors.primary} />}
    >
      {/* Financial Summary Cards */}
      <View style={{ gap: space.md, marginBottom: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <GlassCard padding={space.lg} style={{ flex: 1, borderColor: colors.primary, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs }}>
              <Icon name="arrow-up-circle-outline" size={18} color={colors.primary} />
              <Text style={[type.label, { color: colors.primary }]}>Maine Diye</Text>
            </View>
            <Text style={[type.h2, { color: colors.primary }]}>{formatINR(summary.totalLentPendingPaise)}</Text>
            <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              Lena Hai · {summary.activeLentCount} active
            </Text>
          </GlassCard>

          <GlassCard padding={space.lg} style={{ flex: 1, borderColor: colors.warning, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs }}>
              <Icon name="arrow-down-circle-outline" size={18} color={colors.warning} />
              <Text style={[type.label, { color: colors.warning }]}>Maine Liye</Text>
            </View>
            <Text style={[type.h2, { color: colors.warning }]}>{formatINR(summary.totalBorrowedPendingPaise)}</Text>
            <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              Dena Hai · {summary.activeBorrowedCount} active
            </Text>
          </GlassCard>
        </View>

        {/* Net Udhaar Position */}
        <GlassCard padding={space.md}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={type.caption}>
                {netPending > 0 ? 'Net Receivable (Overall)' : netPending < 0 ? 'Net Payable (Overall)' : 'All Udhaar Settled'}
              </Text>
              <Text
                style={[
                  type.h3,
                  { color: netPending > 0 ? colors.primary : netPending < 0 ? colors.warning : colors.text, marginTop: 2 },
                ]}
              >
                {netPending > 0 ? `+${formatINR(netPending)}` : netPending < 0 ? `-${formatINR(Math.abs(netPending))}` : '₹0'}
              </Text>
            </View>
            <View style={styles.badgePill}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                {summary.activeLentCount + summary.activeBorrowedCount} Open Records
              </Text>
            </View>
          </View>
        </GlassCard>
      </View>

      {/* Filter Tabs */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg }}>
        <FilterChip label="All Active" selected={filter === 'ALL'} onPress={() => setFilter('ALL')} />
        <FilterChip label="Maine Diye (Lent)" selected={filter === 'LENT'} onPress={() => setFilter('LENT')} />
        <FilterChip label="Maine Liye (Borrowed)" selected={filter === 'BORROWED'} onPress={() => setFilter('BORROWED')} />
        <FilterChip label="Settled" selected={filter === 'SETTLED'} onPress={() => setFilter('SETTLED')} />
      </View>

      {/* Loan Records List */}
      {!data.data ? (
        <LoadingState rows={3} />
      ) : filteredLoans.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon="people-outline"
            title={filter === 'SETTLED' ? 'No settled loans' : 'No Udhaar records'}
            message="Track money lent to friends or borrowed without affecting your monthly expense budgets."
            cta="+ Record Udhaar"
            onCta={() => setIsAddOpen(true)}
          />
        </GlassCard>
      ) : (
        <View style={{ gap: space.md }}>
          {filteredLoans.map((loan, idx) => {
            const isLent = loan.direction === 'LENT';
            const repaidPct =
              loan.originalAmountPaise > 0
                ? Math.min(100, Math.round((loan.repaidAmountPaise / loan.originalAmountPaise) * 100))
                : 0;

            return (
              <Animated.View key={loan.id} entering={FadeInDown.delay(idx * 50).duration(300)}>
                <GlassCard padding={space.lg}>
                  {/* Top Row: Person & Direction Badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.h3}>{loan.personName}</Text>
                      {loan.personContact ? (
                        <Text style={[type.caption, { color: colors.textMuted }]}>{loan.personContact}</Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.directionTag,
                        {
                          backgroundColor: isLent ? 'rgba(20, 184, 166, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          borderColor: isLent ? colors.primary : colors.warning,
                        },
                      ]}
                    >
                      <Text style={[type.caption, { color: isLent ? colors.primary : colors.warning, fontWeight: '700' }]}>
                        {isLent ? 'Lent (Maine Diye)' : 'Borrowed (Maine Liye)'}
                      </Text>
                    </View>
                  </View>

                  {/* Amount Breakdown */}
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginBottom: space.sm }}>
                    <Text style={[type.h2, { color: isLent ? colors.primary : colors.warning }]}>
                      {formatINR(loan.remainingAmountPaise)}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]}>
                      remaining of {formatINR(loan.originalAmountPaise)}
                    </Text>
                  </View>

                  {/* Progress Bar if partially repaid */}
                  {loan.repaidAmountPaise > 0 ? (
                    <View style={{ marginBottom: space.sm }}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressBar,
                            {
                              width: `${repaidPct}%`,
                              backgroundColor: isLent ? colors.primary : colors.warning,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[type.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                        {formatINR(loan.repaidAmountPaise)} repaid ({repaidPct}%)
                      </Text>
                    </View>
                  ) : null}

                  {/* Metadata: Notes / Due Date */}
                  <View style={{ gap: 2, marginBottom: space.md }}>
                    {loan.notes ? (
                      <Text style={[type.caption, { color: colors.textSecondary }]}>Note: {loan.notes}</Text>
                    ) : null}
                    {loan.dueDate ? (
                      <Text style={[type.caption, { color: colors.cyan }]}>Due: {fmtDate(loan.dueDate)}</Text>
                    ) : null}
                    <Text style={[type.caption, { color: colors.textMuted }]}>Recorded: {fmtDate(loan.createdAt)}</Text>
                  </View>

                  {/* Actions Row */}
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {loan.status !== 'SETTLED' ? (
                      <>
                        <SecondaryButton
                          label="Repay"
                          size="md"
                          icon="cash-outline"
                          onPress={() => {
                            setRepayingLoan(loan);
                            setRepayAmount(paiseToDecimalString(loan.remainingAmountPaise).replace(/\.00$/, ''));
                            setRepayErr(null);
                          }}
                        />
                        <SecondaryButton
                          label="Settle"
                          size="md"
                          variant="ghost"
                          icon="checkmark-circle-outline"
                          onPress={() => handleSettle(loan)}
                        />
                      </>
                    ) : (
                      <View style={styles.settledBadge}>
                        <Icon name="checkmark-done" size={16} color={colors.success} />
                        <Text style={[type.caption, { color: colors.success, fontWeight: '700' }]}>Fully Settled</Text>
                      </View>
                    )}
                    <IconButton
                      icon="trash-outline"
                      label="Delete Udhaar record"
                      size={18}
                      color={colors.textMuted}
                      onPress={() => setDeletingLoan(loan)}
                    />
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Add Udhaar BottomSheet */}
      {isAddOpen && (
        <BottomSheet
          visible={isAddOpen}
          onClose={() => {
            setIsAddOpen(false);
            setAddErr(null);
          }}
          title="Record Udhaar"
          footer={
            <>
              {addErr ? <InlineNotice tone="error" text={addErr} /> : null}
              <PrimaryButton
                label="Create Udhaar Record"
                icon="people-outline"
                onPress={handleCreateLoan}
                loading={addBusy}
                size="lg"
              />
            </>
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg }}
          >
            <View style={{ gap: space.sm }}>
              <Text style={type.label}>Type</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <FilterChip
                  label="Maine Diye (Lent / Lena Hai)"
                  selected={addDirection === 'LENT'}
                  onPress={() => setAddDirection('LENT')}
                />
                <FilterChip
                  label="Maine Liye (Borrowed / Dena Hai)"
                  selected={addDirection === 'BORROWED'}
                  onPress={() => setAddDirection('BORROWED')}
                />
              </View>
            </View>

            <TextField
              label="Person Name *"
              value={addPersonName}
              onChangeText={(v) => {
                setAddPersonName(v);
                setAddErr(null);
              }}
              placeholder="e.g. Rahul Sharma"
            />

            <TextField
              label="Amount (₹) *"
              value={addAmount}
              onChangeText={(v) => {
                setAddAmount(v);
                setAddErr(null);
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 2000"
            />

            <TextField
              label="Phone / Contact (Optional)"
              value={addPersonContact}
              onChangeText={setAddPersonContact}
              keyboardType="phone-pad"
              placeholder="e.g. 9876543210"
            />

            <TextField
              label="Due Date (Optional)"
              value={addDueDate}
              onChangeText={setAddDueDate}
              placeholder="e.g. 2026-11-01"
              hint="Format: YYYY-MM-DD"
            />

            <TextField
              label="Reason / Notes (Optional)"
              value={addNotes}
              onChangeText={setAddNotes}
              placeholder="e.g. Dinner split, emergency help"
            />
          </ScrollView>
        </BottomSheet>
      )}

      {/* Repay BottomSheet */}
      {repayingLoan && (
        <BottomSheet
          visible={!!repayingLoan}
          onClose={() => {
            setRepayingLoan(null);
            setRepayErr(null);
          }}
          title={`Repay: ${repayingLoan.personName}`}
          footer={
            <>
              {repayErr ? <InlineNotice tone="error" text={repayErr} /> : null}
              <PrimaryButton
                label="Save Repayment"
                icon="cash-outline"
                onPress={handleRecordRepayment}
                loading={repayBusy}
                size="lg"
              />
            </>
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: space.lg, paddingBottom: space.lg }}
          >
            <View style={styles.repaySummaryCard}>
              <Text style={type.caption}>Total Remaining</Text>
              <Text style={[type.h2, { color: colors.primary, marginTop: 2 }]}>
                {formatINR(repayingLoan.remainingAmountPaise)}
              </Text>
            </View>

            <TextField
              label="Repayment Amount (₹) *"
              value={repayAmount}
              onChangeText={(v) => {
                setRepayAmount(v);
                setRepayErr(null);
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 500"
            />

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <ScalePressable
                onPress={() =>
                  setRepayAmount(paiseToDecimalString(repayingLoan.remainingAmountPaise).replace(/\.00$/, ''))
                }
                style={styles.presetChip}
              >
                <Text style={[type.caption, { color: colors.primary, fontWeight: '600' }]}>
                  Full Amount ({formatINR(repayingLoan.remainingAmountPaise)})
                </Text>
              </ScalePressable>
            </View>

            <TextField
              label="Note (Optional)"
              value={repayNotes}
              onChangeText={setRepayNotes}
              placeholder="e.g. GPay transfer, Cash received"
            />
          </ScrollView>
        </BottomSheet>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={!!deletingLoan}
        title="Delete Udhaar Record?"
        message={`Are you sure you want to delete this record for ${deletingLoan?.personName}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeletingLoan(null)}
        onConfirm={handleDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgePill: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radius.sm,
  },
  directionTag: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  settledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: radius.md,
  },
  repaySummaryCard: {
    padding: space.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
