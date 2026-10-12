import { formatINR } from '@paytrack/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/AmbientBackground';
import { FilterChip } from '@/components/CategoryChip';
import { EditExpenseSheet } from '@/components/EditExpenseSheet';
import { Icon } from '@/components/Icon';
import { ConfirmDialog } from '@/components/Overlays';
import { ScalePressable } from '@/components/ScalePressable';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TAB_CONTENT_INSET } from '@/components/TabBar';
import { TransactionCard } from '@/components/TransactionCard';
import { useLiveQuery } from '@/lib/dataVersion';
import { pickDate } from '@/lib/datePicker';
import { dayHeader, fmtDayMonth, startOfDay, startOfMonth, startOfWeek } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteExpense, listExpenses, type BucketFilter, type LocalExpense, type RangeFilter } from '@/lib/repo';
import { scheduleSync, syncNow } from '@/lib/sync';
import { colors, fonts, radius, space, type, useIsLight } from '@/theme/tokens';

const BUCKETS: { key: BucketFilter; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'PAID', label: 'Paid' }, { key: 'PENDING', label: 'Pending' },
  { key: 'FAILED', label: 'Failed' }, { key: 'UNCONFIRMED', label: 'Unconfirmed' },
];
const RANGES: { key: RangeFilter; label: string }[] = [
  { key: 'ALL', label: 'Any time' }, { key: 'TODAY', label: 'Today' }, { key: 'WEEK', label: 'This Week' },
  { key: 'MONTH', label: 'This Month' }, { key: 'CUSTOM', label: 'Custom Date' },
];
const PAGE = 40;

export default function Activity() {
  const insets = useSafeAreaInsets();
  const isLight = useIsLight();
  const params = useLocalSearchParams<{ bucket?: BucketFilter; q?: string }>();
  const [bucket, setBucket] = useState<BucketFilter>(params.bucket ?? 'ALL');
  const [range, setRange] = useState<RangeFilter>('ALL');
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null);
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [limit, setLimit] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);
  const [toDelete, setToDelete] = useState<LocalExpense | null>(null);
  const [toEdit, setToEdit] = useState<LocalExpense | null>(null);

  useEffect(() => { if (params.bucket) setBucket(params.bucket); }, [params.bucket]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setLimit(PAGE), [bucket, range, debounced, custom]);

  const window = useMemo(() => {
    const now = new Date();
    if (range === 'TODAY') return { from: startOfDay(now), to: null };
    if (range === 'WEEK') return { from: startOfWeek(now), to: null };
    if (range === 'MONTH') return { from: startOfMonth(now), to: null };
    if (range === 'CUSTOM' && custom) {
      const to = startOfDay(custom.to);
      to.setDate(to.getDate() + 1);
      return { from: startOfDay(custom.from), to };
    }
    return { from: null, to: null };
  }, [range, custom]);

  const q = useLiveQuery(
    () => listExpenses({ bucket, from: window.from, to: window.to, query: debounced, limit: limit + 1 }),
    [bucket, window, debounced, limit],
  );
  const items = q.data?.slice(0, limit) ?? [];
  const hasMore = (q.data?.length ?? 0) > limit;

  const sections = useMemo(() => {
    const map = new Map<string, LocalExpense[]>();
    for (const e of items) {
      const k = dayHeader(e.expenseDate);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data, total: data.filter((d) => d.status === 'PAID').reduce((s, d) => s + d.amountPaise, 0) }));
  }, [items]);

  const chooseCustom = async () => {
    const today = new Date();
    const from = await pickDate(custom?.from ?? startOfMonth(today), { max: today });
    if (!from) return;
    const to = await pickDate(custom?.to ?? today, { min: from, max: today });
    if (!to) return;
    setCustom({ from, to });
    setRange('CUSTOM');
  };

  const header = (
    <View style={{ gap: space.md, paddingTop: insets.top + space.lg, paddingBottom: space.sm }}>
      <Text style={type.h1} accessibilityRole="header">Activity</Text>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search payee, UPI ID, reason, ₹ amount, UTR…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search payments"
        />
        {query ? (
          <ScalePressable onPress={() => setQuery('')} accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={12}>
            <Icon name="close-circle" size={18} color={colors.textMuted} />
          </ScalePressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
        {BUCKETS.map((b) => <FilterChip key={b.key} label={b.label} selected={bucket === b.key} onPress={() => setBucket(b.key)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RANGES.map((r) => (
          <FilterChip
            key={r.key}
            label={r.key === 'CUSTOM' && custom ? `${fmtDayMonth(custom.from)} – ${fmtDayMonth(custom.to)}` : r.label}
            selected={range === r.key}
            onPress={() => (r.key === 'CUSTOM' ? void chooseCustom() : setRange(r.key))}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AmbientBackground />
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: TAB_CONTENT_INSET + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={type.overline}>{section.title}</Text>
            {section.total ? <Text style={type.caption}>{formatINR(section.total)} paid</Text> : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderItem={({ item }) => (
          <TransactionCard
            expense={item}
            showUtr
            onPress={() => router.push({ pathname: '/activity/[id]', params: { id: item.id } })}
            onEdit={() => setToEdit(item)}
            onDelete={() => setToDelete(item)}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => hasMore && setLimit((l) => l + PAGE)}
        refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await syncNow(); setRefreshing(false); }}
        ListEmptyComponent={
          q.loading ? <LoadingState rows={5} /> :
          q.error ? <ErrorState message="Couldn't load your payments." onRetry={q.refresh} /> :
          debounced || bucket !== 'ALL' || range !== 'ALL'
            ? <EmptyState icon="search-outline" title="No matching payments" message="Try a different search or filter." />
            : <EmptyState icon="receipt-outline" title="No expenses yet." message="Your first payment will appear here automatically." cta="+ Pay" onCta={() => router.push('/pay')} />
        }
        ListFooterComponent={hasMore ? <Text style={[type.caption, { textAlign: 'center', padding: space.lg }]}>Loading more…</Text> : null}
        initialNumToRender={12}
        windowSize={9}
        removeClippedSubviews
      />
      <ConfirmDialog
        visible={!!toDelete}
        title="Delete this expense?"
        message={toDelete ? `${formatINR(toDelete.amountPaise)} to ${toDelete.payeeName ?? toDelete.upiId ?? 'payee'} will be removed from your records. This doesn't affect the actual payment.` : ''}
        confirmLabel="Delete"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteExpense(toDelete.id);
          void haptic.warning();
          setToDelete(null);
          scheduleSync();
        }}
      />
      <EditExpenseSheet expense={toEdit} onClose={() => setToEdit(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 50, borderRadius: radius.lg, paddingHorizontal: space.lg, backgroundColor: colors.surfaceStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, height: '100%' },
  chips: { gap: space.sm, paddingRight: space.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg, marginBottom: space.sm },
});
