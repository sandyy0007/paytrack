import {
  aggregateUdhaarLoans,
  formatINR,
  parseRupeesToPaise,
  paiseToDecimalString,
  type AggregatedUdhaarPerson,
  type Loan,
} from '@paytrack/shared';
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
import { colors, radius, space, type, useIsLight } from '@/theme/tokens';

type FilterType = 'ALL' | 'RECEIVABLE' | 'PAYABLE' | 'SETTLED';

export default function UdhaarScreen() {
  const isLight = useIsLight();
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<AggregatedUdhaarPerson | null>(null);
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
  const aggregatedPersons = aggregateUdhaarLoans(allLoans);

  const summary = data.data?.summary ?? {
    totalLentPendingPaise: 0,
    totalBorrowedPendingPaise: 0,
    totalLentSettledPaise: 0,
    totalBorrowedSettledPaise: 0,
    activeLentCount: 0,
    activeBorrowedCount: 0,
  };

  const netPending = summary.totalLentPendingPaise - summary.totalBorrowedPendingPaise;

  const filteredPersons = aggregatedPersons.filter((p) => {
    if (filter === 'SETTLED') return !p.hasActive;
    if (filter === 'RECEIVABLE') return p.netPendingPaise > 0;
    if (filter === 'PAYABLE') return p.netPendingPaise < 0;
    return p.hasActive;
  });

  // Keep selectedPerson updated with live state
  const liveSelectedPerson = selectedPerson
    ? aggregatedPersons.find((p) => p.identityKey === selectedPerson.identityKey) ?? null
    : null;

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

  const openAddForPerson = (person: AggregatedUdhaarPerson) => {
    setAddPersonName(person.displayName);
    setAddPersonContact(person.upiId || person.contact || '');
    setAddAmount('');
    setAddDirection('LENT');
    setAddNotes('');
    setAddDueDate('');
    setAddErr(null);
    setIsAddOpen(true);
  };

  return (
    <Screen
      title="Udhaar"
      subtitle="Lend & Borrow Manager"
      back={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      right={<IconButton icon="add" label="Add Record" onPress={() => setIsAddOpen(true)} color={colors.primary} />}
    >
      {/* 1. Overall Financial Summary Cards */}
      <View style={{ gap: space.md, marginBottom: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <GlassCard padding={space.lg} style={{ flex: 1, borderColor: colors.primary, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs }}>
              <Icon name="arrow-up-circle-outline" size={18} color={colors.primary} />
              <Text style={[type.label, { color: colors.primary }]}>Total Lent</Text>
            </View>
            <Text style={[type.h2, { color: colors.primary }]}>{formatINR(summary.totalLentPendingPaise)}</Text>
            <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              Receivable · {summary.activeLentCount} active
            </Text>
          </GlassCard>

          <GlassCard padding={space.lg} style={{ flex: 1, borderColor: colors.warning, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs }}>
              <Icon name="arrow-down-circle-outline" size={18} color={colors.warning} />
              <Text style={[type.label, { color: colors.warning }]}>Total Borrowed</Text>
            </View>
            <Text style={[type.h2, { color: colors.warning }]}>{formatINR(summary.totalBorrowedPendingPaise)}</Text>
            <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              Payable · {summary.activeBorrowedCount} active
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
                {summary.activeLentCount + summary.activeBorrowedCount} Active Loans
              </Text>
            </View>
          </View>
        </GlassCard>
      </View>

      {/* 2. Filter Tabs */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        <FilterChip label="All Active" selected={filter === 'ALL'} onPress={() => setFilter('ALL')} />
        <FilterChip label="Receivable (Lent)" selected={filter === 'RECEIVABLE'} onPress={() => setFilter('RECEIVABLE')} />
        <FilterChip label="Payable (Borrowed)" selected={filter === 'PAYABLE'} onPress={() => setFilter('PAYABLE')} />
        <FilterChip label="Settled" selected={filter === 'SETTLED'} onPress={() => setFilter('SETTLED')} />
      </View>

      {/* 3. Aggregated Person List */}
      {!data.data ? (
        <LoadingState rows={3} />
      ) : filteredPersons.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon="people-outline"
            title={filter === 'SETTLED' ? 'No settled records' : 'No Udhaar records'}
            message="Track money lent to friends or borrowed without affecting your monthly expense budgets."
            cta="+ Record Udhaar"
            onCta={() => setIsAddOpen(true)}
          />
        </GlassCard>
      ) : (
        <View style={{ gap: space.md }}>
          {filteredPersons.map((person, idx) => {
            const isReceivable = person.netPendingPaise > 0;
            const isPayable = person.netPendingPaise < 0;

            return (
              <Animated.View key={person.identityKey} entering={FadeInDown.delay(idx * 40).duration(300)}>
                <GlassCard
                  padding={space.lg}
                  onPress={() => setSelectedPerson(person)}
                  accessibilityLabel={`${person.displayName}. Tap to view loan details and history`}
                >
                  {/* Person Name & Net Status */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.h3}>{person.displayName}</Text>
                      {person.upiId ? (
                        <Text style={[type.caption, { color: colors.textMuted }]}>{person.upiId}</Text>
                      ) : person.contact ? (
                        <Text style={[type.caption, { color: colors.textMuted }]}>{person.contact}</Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.directionTag,
                        {
                          backgroundColor: isReceivable
                            ? 'rgba(16, 227, 154, 0.12)'
                            : isPayable
                            ? 'rgba(245, 158, 11, 0.12)'
                            : 'rgba(255, 255, 255, 0.06)',
                          borderColor: isReceivable ? colors.primary : isPayable ? colors.warning : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          type.caption,
                          {
                            color: isReceivable ? colors.primary : isPayable ? colors.warning : colors.textMuted,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {isReceivable
                          ? `Receivable +${formatINR(person.netPendingPaise)}`
                          : isPayable
                          ? `Payable -${formatINR(Math.abs(person.netPendingPaise))}`
                          : 'Settled'}
                      </Text>
                    </View>
                  </View>

                  {/* Summary Row */}
                  <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.caption}>Lent</Text>
                      <Text style={[type.bodyStrong, { color: colors.primary, marginTop: 1 }]}>
                        {formatINR(person.totalLentPendingPaise)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.caption}>Borrowed</Text>
                      <Text style={[type.bodyStrong, { color: colors.warning, marginTop: 1 }]}>
                        {formatINR(person.totalBorrowedPendingPaise)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {person.loans.length} record{person.loans.length === 1 ? '' : 's'}
                        </Text>
                        <Icon name="chevron-forward" size={14} color={colors.textMuted} />
                      </View>
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* 4. Person Detail Sheet */}
      {liveSelectedPerson && (
        <BottomSheet
          visible={!!liveSelectedPerson}
          onClose={() => setSelectedPerson(null)}
          title={liveSelectedPerson.displayName}
          footer={
            <PrimaryButton
              label={`+ Add Record for ${liveSelectedPerson.displayName.split(' ')[0]}`}
              icon="add"
              onPress={() => {
                const p = liveSelectedPerson;
                setSelectedPerson(null);
                openAddForPerson(p);
              }}
              size="lg"
            />
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}
          >
            {/* Person Net Overview */}
            <View style={[styles.personHeaderCard, isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.caption, isLight && { color: '#64748B' }]}>Net Balance</Text>
                <Text
                  style={[
                    type.h2,
                    {
                      color:
                        liveSelectedPerson.netPendingPaise > 0
                          ? colors.primary
                          : liveSelectedPerson.netPendingPaise < 0
                          ? colors.warning
                          : (isLight ? '#1A1A1A' : colors.text),
                      marginTop: 2,
                    },
                  ]}
                >
                  {liveSelectedPerson.netPendingPaise > 0
                    ? `+${formatINR(liveSelectedPerson.netPendingPaise)} (Receivable)`
                    : liveSelectedPerson.netPendingPaise < 0
                    ? `-${formatINR(Math.abs(liveSelectedPerson.netPendingPaise))} (Payable)`
                    : '₹0 (Settled)'}
                </Text>
              </View>
              {liveSelectedPerson.upiId ? (
                <Text style={[type.caption, { color: isLight ? '#64748B' : colors.textMuted }]}>{liveSelectedPerson.upiId}</Text>
              ) : null}
            </View>

            {/* Lent vs Borrowed breakdown */}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={[styles.breakdownCard, isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                <Text style={[type.caption, isLight && { color: '#64748B' }]}>Total Lent</Text>
                <Text style={[type.h3, { color: colors.primary, marginTop: 2 }]}>
                  {formatINR(liveSelectedPerson.totalLentPendingPaise)}
                </Text>
                <Text style={[type.caption, { color: isLight ? '#64748B' : colors.textMuted }]}>
                  {formatINR(liveSelectedPerson.totalLentRepaidPaise)} repaid
                </Text>
              </View>
              <View style={[styles.breakdownCard, isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                <Text style={[type.caption, isLight && { color: '#64748B' }]}>Total Borrowed</Text>
                <Text style={[type.h3, { color: colors.warning, marginTop: 2 }]}>
                  {formatINR(liveSelectedPerson.totalBorrowedPendingPaise)}
                </Text>
                <Text style={[type.caption, { color: isLight ? '#64748B' : colors.textMuted }]}>
                  {formatINR(liveSelectedPerson.totalBorrowedRepaidPaise)} repaid
                </Text>
              </View>
            </View>

            <Text style={[type.label, isLight && { color: '#475569' }, { marginTop: space.xs }]}>Transaction History</Text>

            {/* Individual Transactions for this person */}
            <View style={{ gap: space.sm }}>
              {liveSelectedPerson.loans.map((loan) => {
                const isLent = loan.direction === 'LENT';
                const isSettled = loan.status === 'SETTLED';

                return (
                  <View key={loan.id} style={[styles.loanRowCard, isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                        <Icon
                          name={isLent ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                          size={18}
                          color={isLent ? colors.primary : colors.warning}
                        />
                        <Text style={[type.bodyStrong, { color: isLent ? colors.primary : colors.warning }]}>
                          {isLent ? 'Lent' : 'Borrowed'}
                        </Text>
                      </View>
                      <Text style={[type.caption, { color: colors.textMuted }]}>{fmtDate(loan.createdAt)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: 4 }}>
                      <Text style={[type.h3, { color: isLent ? colors.primary : colors.warning }]}>
                        {formatINR(loan.remainingAmountPaise)}
                      </Text>
                      {loan.repaidAmountPaise > 0 ? (
                        <Text style={[type.caption, { color: colors.textMuted }]}>
                          (of {formatINR(loan.originalAmountPaise)})
                        </Text>
                      ) : null}
                    </View>

                    {loan.notes ? (
                      <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                        Note: {loan.notes}
                      </Text>
                    ) : null}
                    {loan.dueDate ? (
                      <Text style={[type.caption, { color: colors.cyan, marginTop: 1 }]}>
                        Due: {fmtDate(loan.dueDate)}
                      </Text>
                    ) : null}

                    {/* Actions for this individual loan */}
                    <View style={{ flexDirection: 'row', gap: space.xs, justifyContent: 'flex-end', marginTop: space.sm }}>
                      {!isSettled ? (
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
                          <Icon name="checkmark-done" size={14} color={colors.success} />
                          <Text style={[type.caption, { color: colors.success, fontWeight: '700' }]}>Settled</Text>
                        </View>
                      )}
                      <IconButton
                        icon="trash-outline"
                        label="Delete"
                        size={18}
                        color={colors.textMuted}
                        onPress={() => setDeletingLoan(loan)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </BottomSheet>
      )}

      {/* 5. Add Record BottomSheet */}
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
                  label="Lent (Money Given)"
                  selected={addDirection === 'LENT'}
                  onPress={() => setAddDirection('LENT')}
                />
                <FilterChip
                  label="Borrowed (Money Taken)"
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
              label="UPI ID or Phone (Optional)"
              value={addPersonContact}
              onChangeText={setAddPersonContact}
              placeholder="e.g. rahul@upi or 9876543210"
              hint="UPI IDs are automatically recognized for matching"
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
              placeholder="e.g. Dinner split, fuel assistance"
            />
          </ScrollView>
        </BottomSheet>
      )}

      {/* 6. Repay BottomSheet */}
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
            <View style={[styles.repaySummaryCard, isLight && { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
              <Text style={[type.caption, isLight && { color: '#64748B' }]}>Total Remaining</Text>
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
              placeholder="e.g. UPI transfer, Cash received"
            />
          </ScrollView>
        </BottomSheet>
      )}

      {/* 7. Delete Confirmation Dialog */}
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
  settledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: radius.md,
  },
  personHeaderCard: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownCard: {
    flex: 1,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  loanRowCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: colors.border,
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
