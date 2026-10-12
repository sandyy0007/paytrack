import { parseRupeesToPaise, paiseToDecimalString, type Budget, type BudgetPeriod } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/AmbientBackground';
import { IconButton, PrimaryButton } from '@/components/Buttons';
import { CategoryChip, FilterChip } from '@/components/CategoryChip';
import { Icon } from '@/components/Icon';
import { InlineNotice } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useLiveQuery } from '@/lib/dataVersion';
import { haptic } from '@/lib/haptics';
import { ensurePermission } from '@/lib/notifications';
import { getBudget, listCategories, upsertBudget } from '@/lib/repo';
import { useSettings } from '@/lib/settings';
import { scheduleSync } from '@/lib/sync';
import { colors, radius, space, type, useIsLight } from '@/theme/tokens';

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

export default function CreateBudgetScreen() {
  const insets = useSafeAreaInsets();
  const isLight = useIsLight();
  const params = useLocalSearchParams<{ id?: string }>();
  const cats = useLiveQuery(() => listCategories());

  const [budget, setBudget] = useState<Budget | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('MONTHLY');
  const [thresholds, setThresholds] = useState('75, 90, 100');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.id) {
      getBudget(params.id).then((b) => {
        if (b) {
          setBudget(b);
          setCategory(b.category);
          setAmount(paiseToDecimalString(b.amountPaise).replace(/\.00$/, ''));
          setPeriod(b.period);
          setThresholds((b.thresholds ?? [75, 90, 100]).join(', '));
        }
      });
    }
  }, [params.id]);

  const save = async () => {
    Keyboard.dismiss();
    if (!category) {
      return setErr('Please choose a category for this budget.');
    }
    const a = parseRupeesToPaise(amount);
    if (!a.ok || a.paise <= 0) {
      return setErr('Enter a valid budget amount (> ₹0).');
    }
    const t = thresholds.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!t.length || t.some((x) => !Number.isInteger(x) || x < 1 || x > 200) || t.length > 5) {
      return setErr('Warnings must be 1–5 whole percentages, e.g. 75, 90, 100.');
    }
    setBusy(true);
    try {
      await upsertBudget({
        id: budget?.id,
        category,
        amountPaise: a.paise,
        period,
        thresholds: [...new Set(t)].sort((x, y) => x - y),
      });
      void ensurePermission();
      void haptic.success();
      scheduleSync();
      router.back();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const periodInfo = getBudgetPeriodDates(period);

  return (
    <View style={[styles.root, isLight && { backgroundColor: '#F8FAFC' }]}>
      <AmbientBackground />
      <SafeAreaView style={styles.safeArea}>
        {/* Header: < Back        Create Budget */}
        <View style={[styles.header, isLight && { borderBottomColor: '#E2E8F0' }]}>
          <IconButton
            icon="arrow-back"
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/budgets'))}
          />
          <Text style={[type.h2, isLight && { color: '#1A1A1A' }]} accessibilityRole="header">
            {budget ? 'Edit Budget' : 'Create Budget'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Scrollable Form */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Category */}
          <View style={styles.fieldSection}>
            <Text style={[type.label, isLight && { color: '#475569' }]}>Category</Text>
            <View style={styles.chipsWrap}>
              <CategoryChip
                compact
                name="Overall"
                icon="other"
                color={colors.primary}
                selected={category === ALL}
                onPress={() => { setCategory(ALL); setErr(null); }}
              />
              {(cats.data ?? []).map((c) => (
                <CategoryChip
                  key={c.id}
                  compact
                  name={c.name}
                  icon={c.icon}
                  color={c.color}
                  selected={category === c.name}
                  onPress={() => { setCategory(c.name); setErr(null); }}
                />
              ))}
            </View>
          </View>

          {/* Amount (₹) */}
          <TextField
            label="Amount (₹)"
            value={amount}
            onChangeText={(v) => { setAmount(v); setErr(null); }}
            keyboardType="decimal-pad"
            placeholder="8000"
          />

          {/* Budget Period */}
          <View style={styles.fieldSection}>
            <Text style={[type.label, isLight && { color: '#475569' }]}>Budget Period</Text>
            <View style={styles.periodRow}>
              <FilterChip
                label="Monthly"
                selected={period === 'MONTHLY'}
                onPress={() => { setPeriod('MONTHLY'); setErr(null); }}
              />
              <FilterChip
                label="Weekly"
                selected={period === 'WEEKLY'}
                onPress={() => { setPeriod('WEEKLY'); setErr(null); }}
              />
            </View>
          </View>

          {/* Warn me at (%) */}
          <TextField
            label="Warn me at (%)"
            value={thresholds}
            onChangeText={(v) => { setThresholds(v); setErr(null); }}
            keyboardType="numbers-and-punctuation"
            hint="Default 75, 90, 100"
          />

          {/* Calculated Period Coverage / Dates */}
          <View style={[styles.periodCard, isLight && { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <Text style={[type.caption, { color: isLight ? '#475569' : colors.textSecondary }]}>Calculated Period Coverage</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <Text style={[type.caption, isLight && { color: '#64748B' }]}>Start Date</Text>
                <View style={styles.dateBox}>
                  <Icon name="calendar-outline" size={15} color={colors.primary} />
                  <Text style={[type.bodyStrong, { fontSize: 13.5 }, isLight && { color: '#1A1A1A' }]}>{periodInfo.startStr}</Text>
                </View>
              </View>
              <View style={{ marginTop: 18 }}>
                <Icon name="arrow-forward" size={16} color={isLight ? '#94A3B8' : colors.textMuted} />
              </View>
              <View style={styles.dateCol}>
                <Text style={[type.caption, isLight && { color: '#64748B' }]}>End Date</Text>
                <View style={styles.dateBox}>
                  <Icon name="calendar-outline" size={15} color={colors.primary} />
                  <Text style={[type.bodyStrong, { fontSize: 13.5 }, isLight && { color: '#1A1A1A' }]}>{periodInfo.endStr}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.cycleBadge, isLight && { borderTopColor: '#F1F5F9' }]}>
              <Icon name="sync-outline" size={13} color={colors.primary} />
              <Text style={[type.caption, { color: colors.primary, fontSize: 12 }]}>{periodInfo.cycleDesc}</Text>
            </View>
          </View>

          {/* Validation/error message */}
          {err ? <InlineNotice tone="error" text={err} /> : null}

          {/* Create Budget button */}
          <PrimaryButton
            label={budget ? 'Save Budget' : 'Create Budget'}
            icon="wallet-outline"
            onPress={save}
            loading={busy}
            size="lg"
            style={{ marginTop: space.sm }}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.lg,
  },
  fieldSection: {
    gap: space.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  periodRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  periodCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  dateCol: {
    flex: 1,
    gap: 4,
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.xs,
  },
  cycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.xs,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

