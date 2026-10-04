import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatINR, type Budget } from '@paytrack/shared';
import { Icon } from '@/components/Icon';
import { GlassCard } from '@/components/GlassCard';
import { expensesSince, getMoneyPosition, getPayeeMemory, listBudgets, type LocalExpense } from '@/lib/repo';
import { colors, radius, space, type } from '@/theme/tokens';

export function PrePaymentIntelligence({ expense }: { expense: LocalExpense }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [spentPaise, setSpentPaise] = useState<number>(0);
  const [duplicateRecent, setDuplicateRecent] = useState<LocalExpense | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [historyAvgPaise, setHistoryAvgPaise] = useState<number>(0);
  const [usablePaise, setUsablePaise] = useState<number>(0);

  useEffect(() => {
    (async () => {
      // 1. Money Position
      const pos = await getMoneyPosition();
      setUsablePaise(pos.usablePaise);

      // 2. Find matching category budget for this month
      const budgets = await listBudgets();
      const b = budgets.find((item) => item.category.toLowerCase() === expense.category.toLowerCase());
      setBudget(b ?? null);

      // 3. Calculate current month spent for this category (PAID only, EXPENSE only)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const allExpenses = await expensesSince(monthStart);
      const catSpent = allExpenses
        .filter((e) => e.status === 'PAID' && (!e.financialType || e.financialType === 'EXPENSE') && e.category.toLowerCase() === expense.category.toLowerCase())
        .reduce((sum, e) => sum + e.amountPaise, 0);
      setSpentPaise(catSpent);

      // 4. Duplicate Payment Detection (within last 24h, same payee/UPI, same amount)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = allExpenses.find(
        (e) =>
          e.id !== expense.id &&
          e.status === 'PAID' &&
          new Date(e.createdAt).getTime() >= oneDayAgo.getTime() &&
          e.amountPaise === expense.amountPaise &&
          ((expense.upiId && e.upiId === expense.upiId) || (expense.payeeName && e.payeeName === expense.payeeName))
      );
      setDuplicateRecent(recent ?? null);

      // 5. Payee Memory
      const mem = await getPayeeMemory(expense.payeeName, expense.upiId);
      if (mem) {
        setHistoryCount(mem.paymentCount);
        setHistoryAvgPaise(mem.averagePaidPaise);
      }
    })().catch(() => undefined);
  }, [expense]);

  const projectedTotal = spentPaise + expense.amountPaise;
  const budgetLimit = budget?.amountPaise ?? 0;
  const projectedPercent = budgetLimit > 0 ? Math.round((projectedTotal / budgetLimit) * 100) : 0;
  const projectedRemaining = budgetLimit > 0 ? budgetLimit - projectedTotal : 0;
  const isOverBudget = budgetLimit > 0 && projectedTotal > budgetLimit;
  const isLent = expense.financialType === 'LENT';

  return (
    <View style={{ gap: space.md, marginTop: space.md }}>
      {/* Duplicate Payment Protection Alert */}
      {duplicateRecent ? (
        <View style={styles.warnCard}>
          <Icon name="warning-outline" size={20} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.label, { color: colors.warning }]}>Possible Duplicate Payment</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              You already paid {formatINR(expense.amountPaise)} to {expense.payeeName ?? expense.upiId} recently. Please verify this isn't an accidental duplicate.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Money Lent Notice */}
      {isLent ? (
        <View style={styles.lentCard}>
          <Icon name="hand-right-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.label, { color: colors.primary }]}>Money Lent (Udhaar)</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              This payment is classified as Money Lent. It will be recorded under Udhaar and won't affect your monthly category budget or expense totals.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Can I Afford This / Pre-Payment Intelligence Card */}
      <GlassCard padding={space.lg}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Icon name="pie-chart-outline" size={16} color={colors.primary} />
            <Text style={type.h3}>Can I Afford This?</Text>
          </View>
          <Text style={[type.caption, { color: colors.primary }]}>{isLent ? 'Udhaar' : expense.category}</Text>
        </View>

        <View style={{ gap: space.sm }}>
          {usablePaise > 0 ? (
            <>
              <View style={styles.statRow}>
                <Text style={type.caption}>Available Money</Text>
                <Text style={type.bodyStrong}>{formatINR(usablePaise)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={type.caption}>This Payment</Text>
                <Text style={[type.bodyStrong, { color: colors.primary }]}>-{formatINR(expense.amountPaise)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={type.caption}>After Payment</Text>
                <Text style={[type.bodyStrong, usablePaise - expense.amountPaise < 0 ? { color: colors.error } : {}]}>
                  {formatINR(usablePaise - expense.amountPaise)}
                </Text>
              </View>
            </>
          ) : null}

          {!isLent && budgetLimit > 0 ? (
            <>
              <View style={styles.statRow}>
                <Text style={type.caption}>Category Budget ({expense.category})</Text>
                <Text style={type.bodyStrong}>
                  {formatINR(spentPaise)} <Text style={{ color: colors.textMuted }}>/ {formatINR(budgetLimit)}</Text>
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={type.caption}>{isOverBudget ? 'Budget Exceeded By' : 'Remaining Budget'}</Text>
                <Text style={[type.bodyStrong, isOverBudget ? { color: colors.error } : { color: colors.success }]}>
                  {formatINR(Math.abs(projectedRemaining))}
                </Text>
              </View>
              {isOverBudget ? (
                <Text style={[type.caption, { color: colors.error }]}>
                  ⚠ This payment exceeds your {expense.category} budget by {formatINR(Math.abs(projectedRemaining))}.
                </Text>
              ) : null}

              {/* Visual Budget Progress Bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${Math.min(projectedPercent, 100)}%`,
                      backgroundColor: isOverBudget ? colors.error : projectedPercent > 80 ? colors.warning : colors.primary,
                    },
                  ]}
                />
              </View>
            </>
          ) : !isLent ? (
            <View style={styles.statRow}>
              <Text style={type.caption}>Spent on {expense.category} this month</Text>
              <Text style={type.bodyStrong}>{formatINR(spentPaise)}</Text>
            </View>
          ) : null}
        </View>

        {/* Payee Memory / Recurring Payee Insight */}
        {historyCount > 0 ? (
          <View style={styles.memoryFooter}>
            <Icon name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
              Payee Memory: {historyCount} previous payment{historyCount > 1 ? 's' : ''} to this payee (avg {formatINR(historyAvgPaise)})
            </Text>
          </View>
        ) : null}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceStrong,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  lentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.3)',
  },
});
