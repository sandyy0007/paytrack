import { budgetUsage, formatINR, parseRupeesToPaise, paiseToDecimalString, spentInPeriod, type Budget, type BudgetPeriod } from '@paytrack/shared';
import { useEffect, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BudgetProgress, usageColor } from '@/components/BudgetProgress';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { CategoryChip, FilterChip } from '@/components/CategoryChip';
import { GlassCard } from '@/components/GlassCard';
import { categoryIcon, Icon } from '@/components/Icon';
import { BottomSheet, ConfirmDialog } from '@/components/Overlays';
import { ScalePressable } from '@/components/ScalePressable';
import { Screen } from '@/components/Screen';
import { EmptyState, InlineNotice, LoadingState } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { TextField } from '@/components/TextField';
import { categoryMeta } from '@/components/TransactionCard';
import { useLiveQuery } from '@/lib/dataVersion';
import { tzOffsetMinutes } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { ensurePermission } from '@/lib/notifications';
import {
  deleteBudget, deleteEnvelope, expensesSince, listBudgets, listCategories,
  listEnvelopes, transferEnvelopeFunds, upsertBudget, upsertEnvelope, type Envelope,
} from '@/lib/repo';
import { scheduleSync } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';

const ALL = '__ALL__';

function getBudgetPeriodDates(p: BudgetPeriod) {
  const now = new Date();
  if (p === 'MONTHLY') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return {
      startStr: start.toLocaleDateString('en-IN', opts),
      endStr: end.toLocaleDateString('en-IN', opts),
      cycleDesc: 'Resets on the 1st of each calendar month',
    };
  } else {
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return {
      startStr: start.toLocaleDateString('en-IN', opts),
      endStr: end.toLocaleDateString('en-IN', opts),
      cycleDesc: 'Resets every Monday at midnight',
    };
  }
}

function BudgetEditor({ budget, visible, onClose }: { budget: Budget | null; visible: boolean; onClose: () => void }) {
  const cats = useLiveQuery(() => listCategories());
  const [category, setCategory] = useState(budget?.category ?? 'Food');
  const [amount, setAmount] = useState(budget ? paiseToDecimalString(budget.amountPaise).replace(/\.00$/, '') : '');
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? 'MONTHLY');
  const [thresholds, setThresholds] = useState((budget?.thresholds ?? [75, 90, 100]).join(', '));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(budget?.category ?? 'Food');
      setAmount(budget ? paiseToDecimalString(budget.amountPaise).replace(/\.00$/, '') : '');
      setPeriod(budget?.period ?? 'MONTHLY');
      setThresholds((budget?.thresholds ?? [75, 90, 100]).join(', '));
      setErr(null);
      setBusy(false);
    }
  }, [budget, visible]);

  const save = async () => {
    Keyboard.dismiss();
    const a = parseRupeesToPaise(amount);
    if (!a.ok || a.paise <= 0) return setErr('Enter a valid budget amount (> ₹0).');
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

  const periodInfo = getBudgetPeriodDates(period);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      fullHeight
      footer={
        <View style={{ gap: space.xs }}>
          {err ? <InlineNotice tone="error" text={err} /> : null}
          <PrimaryButton
            label={budget ? 'Save budget' : 'Create Budget'}
            icon="wallet-outline"
            onPress={save}
            loading={busy}
            size="lg"
          />
        </View>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.md, paddingBottom: 40, flexGrow: 1 }}
      >
        <View style={{ gap: 6 }}>
          <Text style={type.label}>Category</Text>
          <View style={styles.chips}>
            <CategoryChip compact name="Overall" icon="other" color={colors.primary} selected={category === ALL} onPress={() => setCategory(ALL)} />
            {(cats.data ?? []).map((c) => (
              <CategoryChip key={c.id} compact name={c.name} icon={c.icon} color={c.color} selected={category === c.name} onPress={() => setCategory(c.name)} />
            ))}
          </View>
        </View>

        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={(v) => { setAmount(v); setErr(null); }}
          keyboardType="decimal-pad"
          placeholder="8000"
        />

        <View style={{ gap: 6 }}>
          <Text style={type.label}>Period</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <FilterChip label="Monthly" selected={period === 'MONTHLY'} onPress={() => setPeriod('MONTHLY')} />
            <FilterChip label="Weekly" selected={period === 'WEEKLY'} onPress={() => setPeriod('WEEKLY')} />
          </View>
        </View>

        <TextField
          label="Warn me at (%)"
          value={thresholds}
          onChangeText={setThresholds}
          keyboardType="numbers-and-punctuation"
          hint="Default 75, 90, 100"
        />

        <View style={styles.periodCard}>
          <Text style={[type.caption, { color: colors.textSecondary }]}>Calculated Period Coverage</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs }}>
            <View>
              <Text style={type.caption}>Start Date</Text>
              <Text style={[type.bodyStrong, { fontSize: 13 }]}>{periodInfo.startStr}</Text>
            </View>
            <Icon name="arrow-forward" size={14} color={colors.textMuted} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={type.caption}>End Date</Text>
              <Text style={[type.bodyStrong, { fontSize: 13 }]}>{periodInfo.endStr}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
            <Icon name="sync-outline" size={12} color={colors.primary} />
            <Text style={[type.caption, { color: colors.primary, fontSize: 12 }]}>{periodInfo.cycleDesc}</Text>
          </View>
        </View>

        {err ? <InlineNotice tone="error" text={err} /> : null}
      </ScrollView>
    </BottomSheet>
  );
}

function EnvelopeEditor({ envelope, visible, onClose }: { envelope: Envelope | null; visible: boolean; onClose: () => void }) {
  const [name, setName] = useState(envelope?.name ?? '');
  const [amount, setAmount] = useState(envelope ? paiseToDecimalString(envelope.allocatedPaise).replace(/\.00$/, '') : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    Keyboard.dismiss();
    const cleanName = name.trim();
    if (!cleanName) return setErr('Please enter an envelope name.');
    const a = parseRupeesToPaise(amount);
    if (!a.ok || a.paise <= 0) return setErr('Enter a valid allocated amount (> ₹0).');
    setBusy(true);
    try {
      await upsertEnvelope({ id: envelope?.id, name: cleanName, allocatedPaise: a.paise });
      void haptic.success();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={envelope ? 'Edit Envelope' : 'New Smart Envelope'}
      footer={
        <>
          {err ? <InlineNotice tone="error" text={err} /> : null}
          <PrimaryButton
            label={envelope ? 'Save Envelope' : 'Create Envelope'}
            icon="folder-outline"
            onPress={save}
            loading={busy}
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
        <TextField label="Envelope Name" value={name} onChangeText={(v) => { setName(v); setErr(null); }} placeholder="e.g. Groceries, Fuel, Dining Out" />
        <TextField label="Allocated Amount (₹)" value={amount} onChangeText={(v) => { setAmount(v); setErr(null); }} keyboardType="decimal-pad" placeholder="5000" />
      </ScrollView>
    </BottomSheet>
  );
}

function EnvelopeTransferDialog({
  envelopes,
  fromEnvelope,
  visible,
  onClose,
}: {
  envelopes: Envelope[];
  fromEnvelope: Envelope | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [toId, setToId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const otherEnvelopes = envelopes.filter((e) => e.id !== fromEnvelope?.id);

  const handleTransfer = async () => {
    if (!fromEnvelope) return;
    if (!toId) return setErr('Select an envelope to transfer into.');
    const a = parseRupeesToPaise(amount);
    if (!a.ok || a.paise <= 0) return setErr('Enter a valid amount to transfer.');
    if (a.paise > fromEnvelope.allocatedPaise) return setErr(`Cannot transfer more than available (${formatINR(fromEnvelope.allocatedPaise)}).`);
    setBusy(true);
    try {
      await transferEnvelopeFunds(fromEnvelope.id, toId, a.paise);
      void haptic.success();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Transfer Envelope Funds"
      footer={
        <>
          {err ? <InlineNotice tone="error" text={err} /> : null}
          <PrimaryButton
            label="Transfer Now"
            icon="swap-horizontal-outline"
            onPress={handleTransfer}
            loading={busy}
          />
        </>
      }
    >
      <View style={{ gap: space.md, paddingBottom: space.lg }}>
        <Text style={type.caption}>
          From: <Text style={type.bodyStrong}>{fromEnvelope?.name}</Text> (Available: {formatINR(fromEnvelope?.allocatedPaise ?? 0)})
        </Text>
        <Text style={type.label}>Transfer To:</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {otherEnvelopes.map((env) => (
            <FilterChip
              key={env.id}
              label={env.name}
              selected={toId === env.id}
              onPress={() => { setToId(env.id); setErr(null); }}
            />
          ))}
        </View>
        <TextField
          label="Transfer Amount (₹)"
          value={amount}
          onChangeText={(v) => { setAmount(v); setErr(null); }}
          keyboardType="decimal-pad"
          placeholder="1000"
        />
      </View>
    </BottomSheet>
  );
}

export default function Budgets() {
  const [tab, setTab] = useState<'BUDGETS' | 'ENVELOPES'>('BUDGETS');
  const [editingBudget, setEditingBudget] = useState<{ budget: Budget | null } | null>(null);
  const [toDeleteBudget, setToDeleteBudget] = useState<Budget | null>(null);

  // Envelopes state
  const [editingEnvelope, setEditingEnvelope] = useState<{ envelope: Envelope | null } | null>(null);
  const [transferFrom, setTransferFrom] = useState<Envelope | null>(null);
  const [toDeleteEnvelope, setToDeleteEnvelope] = useState<Envelope | null>(null);

  const q = useLiveQuery(async () => {
    const now = new Date();
    const [budgets, rows, envelopes] = await Promise.all([
      listBudgets(),
      expensesSince(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      listEnvelopes(),
    ]);
    const tz = tzOffsetMinutes();
    const budgetList = budgets.map((b) => ({ b, spent: spentInPeriod(rows, b.category, b.period, now, tz) }));
    return { budgetList, envelopes };
  });

  const budgetItems = q.data?.budgetList ?? [];
  const envelopeItems = q.data?.envelopes ?? [];

  return (
    <Screen bottomInset={TAB_CONTENT_INSET}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={type.h1} accessibilityRole="header">Planning & Budgets</Text>
          <Text style={type.label}>
            {tab === 'BUDGETS' ? 'Category spending limits' : 'Cash envelope allocation'}
          </Text>
        </View>
        <IconButton
          icon="add"
          label={tab === 'BUDGETS' ? 'Add budget' : 'Add envelope'}
          onPress={() => (tab === 'BUDGETS' ? setEditingBudget({ budget: null }) : setEditingEnvelope({ envelope: null }))}
          color={colors.primary}
        />
      </View>

      {/* Tabs */}
      <View style={styles.segmentWrap}>
        <ScalePressable
          onPress={() => setTab('BUDGETS')}
          style={[styles.segmentBtn, tab === 'BUDGETS' && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, tab === 'BUDGETS' && styles.segmentTextActive]}>
            Category Budgets ({budgetItems.length})
          </Text>
        </ScalePressable>
        <ScalePressable
          onPress={() => setTab('ENVELOPES')}
          style={[styles.segmentBtn, tab === 'ENVELOPES' && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, tab === 'ENVELOPES' && styles.segmentTextActive]}>
            Smart Envelopes ({envelopeItems.length})
          </Text>
        </ScalePressable>
      </View>

      {tab === 'BUDGETS' ? (
        <>
          {!q.data ? (
            <LoadingState rows={3} />
          ) : budgetItems.length === 0 ? (
            <GlassCard>
              <EmptyState
                icon="wallet-outline"
                title="No budgets yet"
                message="Set limits like Food ₹8,000/month and get a heads-up at 75%, 90% and 100%."
                cta="Create budget"
                onCta={() => setEditingBudget({ budget: null })}
              />
            </GlassCard>
          ) : (
            budgetItems.map(({ b, spent }, i) => {
              const meta = b.category === ALL ? { name: 'Overall', icon: 'other', color: colors.primary } : categoryMeta(b.category);
              const u = budgetUsage(spent, b.amountPaise, b.thresholds);
              return (
                <Animated.View key={b.id} entering={FadeInDown.delay(i * 60).duration(350)}>
                  <GlassCard padding={space.xl} onPress={() => setEditingBudget({ budget: b })} accessibilityLabel={`${meta.name} budget. Tap to edit`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
                      <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}>
                        <Icon name={categoryIcon(meta.icon)} size={20} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.h3}>{meta.name}</Text>
                        <Text style={type.caption}>{formatINR(b.amountPaise)}/{b.period === 'MONTHLY' ? 'month' : 'week'} · warns at {b.thresholds.join('/')}%</Text>
                      </View>
                      <IconButton icon="trash-outline" label={`Delete ${meta.name} budget`} onPress={() => setToDeleteBudget(b)} color={colors.textMuted} size={18} />
                    </View>
                    <BudgetProgress spentPaise={spent} limitPaise={b.amountPaise} thresholds={b.thresholds} />
                    {u.level !== 'OK' ? (
                      <Text style={[type.caption, { color: usageColor(u.level), marginTop: space.sm }]}>
                        {u.level === 'OVER' ? `Over by ${formatINR(spent - b.amountPaise)}` : `${formatINR(b.amountPaise - spent)} left`}
                      </Text>
                    ) : (
                      <Text style={[type.caption, { marginTop: space.sm }]}>{formatINR(b.amountPaise - spent)} left</Text>
                    )}
                  </GlassCard>
                </Animated.View>
              );
            })
          )}
          <SecondaryButton
            label="Add Category Budget"
            icon="add"
            variant="ghost"
            size="md"
            onPress={() => setEditingBudget({ budget: null })}
            style={{ borderRadius: radius.lg }}
          />
        </>
      ) : (
        <>
          {/* Smart Envelopes Tab */}
          {!q.data ? (
            <LoadingState rows={3} />
          ) : envelopeItems.length === 0 ? (
            <GlassCard>
              <EmptyState
                icon="folder-outline"
                title="No envelopes yet"
                message="Smart cash envelopes let you allocate set amounts to specific life areas and transfer balances anytime."
                cta="Create Envelope"
                onCta={() => setEditingEnvelope({ envelope: null })}
              />
            </GlassCard>
          ) : (
            envelopeItems.map((env, i) => (
              <Animated.View key={env.id} entering={FadeInDown.delay(i * 60).duration(350)}>
                <GlassCard padding={space.xl}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
                      <View style={[styles.icon, { backgroundColor: 'rgba(16, 227, 154, 0.15)' }]}>
                        <Icon name="folder-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.h3}>{env.name}</Text>
                        <Text style={type.caption}>Allocated: {formatINR(env.allocatedPaise)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <SecondaryButton
                        label="Transfer"
                        size="md"
                        variant="ghost"
                        onPress={() => setTransferFrom(env)}
                      />
                      <IconButton
                        icon="trash-outline"
                        label="Delete envelope"
                        size={18}
                        color={colors.textMuted}
                        onPress={() => setToDeleteEnvelope(env)}
                      />
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            ))
          )}
          <SecondaryButton
            label="Add Smart Envelope"
            icon="add"
            variant="ghost"
            size="md"
            onPress={() => setEditingEnvelope({ envelope: null })}
            style={{ borderRadius: radius.lg }}
          />
        </>
      )}

      {/* Modals & Dialogs */}
      {editingBudget ? (
        <BudgetEditor
          key={editingBudget.budget?.id ?? 'new'}
          budget={editingBudget.budget}
          visible
          onClose={() => setEditingBudget(null)}
        />
      ) : null}

      {editingEnvelope ? (
        <EnvelopeEditor
          key={editingEnvelope.envelope?.id ?? 'new-env'}
          envelope={editingEnvelope.envelope}
          visible
          onClose={() => setEditingEnvelope(null)}
        />
      ) : null}

      <EnvelopeTransferDialog
        envelopes={envelopeItems}
        fromEnvelope={transferFrom}
        visible={!!transferFrom}
        onClose={() => setTransferFrom(null)}
      />

      <ConfirmDialog
        visible={!!toDeleteBudget}
        title="Delete budget?"
        message="Your expenses stay as they are."
        confirmLabel="Delete"
        destructive
        onCancel={() => setToDeleteBudget(null)}
        onConfirm={async () => {
          if (toDeleteBudget) await deleteBudget(toDeleteBudget.id);
          scheduleSync();
          setToDeleteBudget(null);
        }}
      />

      <ConfirmDialog
        visible={!!toDeleteEnvelope}
        title="Delete envelope?"
        message="The envelope allocation will be removed."
        confirmLabel="Delete"
        destructive
        onCancel={() => setToDeleteEnvelope(null)}
        onConfirm={async () => {
          if (toDeleteEnvelope) await deleteEnvelope(toDeleteEnvelope.id);
          setToDeleteEnvelope(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  periodCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: space.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: space.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
});
