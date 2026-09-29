import { budgetUsage, formatINR, parseRupeesToPaise, paiseToDecimalString, spentInPeriod, type Budget, type BudgetPeriod } from '@paytrack/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BudgetProgress, usageColor } from '@/components/BudgetProgress';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { CategoryChip, FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { categoryIcon, Icon } from '@/components/Icon';
import { BottomSheet, ConfirmDialog } from '@/components/Overlays';
import { Screen } from '@/components/Screen';
import { EmptyState, InlineNotice, LoadingState } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { TextField } from '@/components/TextField';
import { categoryMeta } from '@/components/TransactionCard';
import { useLiveQuery } from '@/lib/dataVersion';
import { tzOffsetMinutes } from '@/lib/format';
import { ensurePermission } from '@/lib/notifications';
import { deleteBudget, expensesSince, listBudgets, listCategories, upsertBudget } from '@/lib/repo';
import { scheduleSync } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';

const ALL = '__ALL__';

function BudgetEditor({ budget, visible, onClose }: { budget: Budget | null; visible: boolean; onClose: () => void }) {
  const cats = useLiveQuery(() => listCategories());
  const [category, setCategory] = useState(budget?.category ?? 'Food');
  const [amount, setAmount] = useState(budget ? paiseToDecimalString(budget.amountPaise).replace(/\.00$/, '') : '');
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'MONTHLY');
  const [thresholds, setThresholds] = useState((budget?.thresholds ?? [75, 90, 100]).join(', '));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const a = parseRupeesToPaise(amount);
    if (!a.ok) return setErr('Enter a valid budget amount.');
    const t = thresholds.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!t.length || t.some((x) => !Number.isInteger(x) || x < 1 || x > 200) || t.length > 5) return setErr('Warnings must be 1–5 whole percentages, e.g. 75, 90, 100.');
    setBusy(true);
    try {
      await upsertBudget({ id: budget?.id, category, amountPaise: a.paise, period, thresholds: [...new Set(t)].sort((x, y) => x - y) });
      void ensurePermission();
      scheduleSync();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={budget ? 'Edit budget' : 'New budget'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Category</Text>
          <View style={styles.chips}>
            <CategoryChip name="Overall" icon="other" color={colors.primary} selected={category === ALL} onPress={() => setCategory(ALL)} />
            {(cats.data ?? []).map((c) => <CategoryChip key={c.id} name={c.name} icon={c.icon} color={c.color} selected={category === c.name} onPress={() => setCategory(c.name)} />)}
          </View>
        </View>
        <TextField label="Amount (₹)" value={amount} onChangeText={(v) => { setAmount(v); setErr(null); }} keyboardType="decimal-pad" placeholder="8000" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <FilterChip label="Monthly" selected={period === 'MONTHLY'} onPress={() => setPeriod('MONTHLY')} />
          <FilterChip label="Weekly" selected={period === 'WEEKLY'} onPress={() => setPeriod('WEEKLY')} />
        </View>
        <TextField label="Warn me at (%)" value={thresholds} onChangeText={setThresholds} keyboardType="numbers-and-punctuation" hint="Default 75, 90, 100" />
        {err ? <InlineNotice tone="error" text={err} /> : null}
        <PrimaryButton label="Save budget" onPress={save} loading={busy} size="md" />
      </ScrollView>
    </BottomSheet>
  );
}

export default function Budgets() {
  const [editing, setEditing] = useState<{ budget: Budget | null } | null>(null);
  const [toDelete, setToDelete] = useState<Budget | null>(null);
  const q = useLiveQuery(async () => {
    const now = new Date();
    const [budgets, rows] = await Promise.all([listBudgets(), expensesSince(new Date(now.getFullYear(), now.getMonth() - 1, 1))]);
    const tz = tzOffsetMinutes();
    return budgets.map((b) => ({ b, spent: spentInPeriod(rows, b.category, b.period, now, tz) }));
  });

  return (
    <Screen bottomInset={TAB_CONTENT_INSET}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={type.h1} accessibilityRole="header">Budgets</Text>
          <Text style={type.label}>Based on paid payments</Text>
        </View>
        <IconButton icon="add" label="Add budget" onPress={() => setEditing({ budget: null })} color={colors.primary} />
      </View>
      {!q.data ? <LoadingState rows={3} /> : q.data.length === 0 ? (
        <GlassCard>
          <EmptyState icon="wallet-outline" title="No budgets yet" message="Set limits like Food ₹8,000/month and get a heads-up at 75%, 90% and 100%." cta="Create budget" onCta={() => setEditing({ budget: null })} />
        </GlassCard>
      ) : (
        q.data.map(({ b, spent }, i) => {
          const meta = b.category === ALL ? { name: 'Overall', icon: 'other', color: colors.primary } : categoryMeta(b.category);
          const u = budgetUsage(spent, b.amountPaise, b.thresholds);
          return (
            <Animated.View key={b.id} entering={FadeInDown.delay(i * 60).duration(350)}>
              <GlassCard padding={space.xl} onPress={() => setEditing({ budget: b })} accessibilityLabel={`${meta.name} budget. Tap to edit`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
                  <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}><Icon name={categoryIcon(meta.icon)} size={20} color={meta.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3}>{meta.name}</Text>
                    <Text style={type.caption}>{formatINR(b.amountPaise)}/{b.period === 'MONTHLY' ? 'month' : 'week'} · warns at {b.thresholds.join('/')}%</Text>
                  </View>
                  <IconButton icon="trash-outline" label={`Delete ${meta.name} budget`} onPress={() => setToDelete(b)} color={colors.textMuted} size={18} />
                </View>
                <BudgetProgress spentPaise={spent} limitPaise={b.amountPaise} thresholds={b.thresholds} />
                {u.level !== 'OK' ? (
                  <Text style={[type.caption, { color: usageColor(u.level), marginTop: space.sm }]}>
                    {u.level === 'OVER' ? `Over by ${formatINR(spent - b.amountPaise)}` : `${formatINR(b.amountPaise - spent)} left`}
                  </Text>
                ) : <Text style={[type.caption, { marginTop: space.sm }]}>{formatINR(b.amountPaise - spent)} left</Text>}
              </GlassCard>
            </Animated.View>
          );
        })
      )}
      {editing ? <BudgetEditor key={editing.budget?.id ?? 'new'} budget={editing.budget} visible onClose={() => setEditing(null)} /> : null}
      <SecondaryButton label="Add budget" icon="add" variant="ghost" size="md" onPress={() => setEditing({ budget: null })} style={{ borderRadius: radius.lg }} />
      <ConfirmDialog visible={!!toDelete} title="Delete budget?" message="Your expenses stay as they are." confirmLabel="Delete" destructive
        onCancel={() => setToDelete(null)} onConfirm={async () => { if (toDelete) await deleteBudget(toDelete.id); scheduleSync(); setToDelete(null); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
