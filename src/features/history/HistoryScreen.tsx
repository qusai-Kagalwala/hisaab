import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { CategoryIcon, Icon, type IconName } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { Chip } from '../../components/ui';
import { monthLabel } from '../../engine/calendar';
import { entryLabel, filterEntries, type TypeFilter } from '../../engine/entries';
import { groupByDay } from '../../engine/ledger';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { dayLabel, timeLabel } from '../../utils/dates';

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Spent' },
  { id: 'income', label: 'Money in' },
  { id: 'transfer', label: 'Moves' },
  { id: 'people', label: 'Borrow & lend' },
];

export function HistoryScreen() {
  const p = usePalette();
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const allAccounts = useLedgerStore((s) => s.allAccounts);
  const debts = useLedgerStore((s) => s.debts);
  const recurringTxIds = useLedgerStore((s) => s.recurringTxIds);
  const params = useLocalSearchParams<{ category?: string; month?: string }>();
  const categoryFilter = params.category ? Number(params.category) : null;
  const monthFilter = params.month || null;

  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [accountId, setAccountId] = useState<number | null>(null);

  const lookups = useMemo(
    () => ({
      categories: new Map(categories.map((c) => [c.id, c])),
      accounts: new Map(allAccounts.map((a) => [a.id, a])),
      debts: new Map(debts.map((d) => [d.id, d])),
    }),
    [categories, allAccounts, debts],
  );
  const filtered = useMemo(
    () => filterEntries(transactions, { query, type, categoryId: categoryFilter, accountId, month: monthFilter }, lookups),
    [transactions, query, type, categoryFilter, accountId, monthFilter, lookups],
  );
  const sections = useMemo(() => groupByDay(filtered).map((g) => ({ ...g, data: g.transactions })), [filtered]);
  const hasAny = transactions.some((t) => !t.voided);
  const filtering = query !== '' || type !== 'all' || categoryFilter != null || accountId != null || monthFilter != null;

  const clearParam = (key: 'category' | 'month') => router.setParams({ [key]: '' });

  const header = (
    <View style={styles.filters}>
      <View style={[styles.search, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Icon name="magnify" size={20} color={p.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes, categories, people"
          placeholderTextColor={p.textMuted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search history"
          style={[styles.searchInput, { color: p.text }]}
        />
        {query !== '' && (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={p.textMuted} />
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {TYPES.map((t) => (
          <Chip key={t.id} label={t.label} selected={type === t.id} onPress={() => setType(t.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {categoryFilter != null && (
          <Chip
            label={`${lookups.categories.get(categoryFilter)?.name ?? 'Category'}  ✕`}
            icon="filter-variant"
            selected
            onPress={() => clearParam('category')}
          />
        )}
        {monthFilter != null && (
          <Chip label={`${monthLabel(monthFilter)}  ✕`} icon="calendar-month-outline" selected onPress={() => clearParam('month')} />
        )}
        {allAccounts.filter((a) => !a.archived || a.id === accountId).map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={accountId === a.id}
            onPress={() => setAccountId(accountId === a.id ? null : a.id)}
          />
        ))}
      </ScrollView>
    </View>
  );

  if (!hasAny) {
    return (
      <View style={[styles.empty, { backgroundColor: p.background }]}>
        <Text style={[styles.emptyTitle, { color: p.text }]}>Nothing logged yet</Text>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>
          Your entries will show up here. Tap + to log your first chai.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      {header}
      <SectionList
        style={{ backgroundColor: p.background }}
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={{ color: p.textMuted, textAlign: 'center', marginTop: 32 }}>
            {filtering ? 'Nothing matches. Try another search or filter.' : 'Nothing here yet.'}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={[styles.headerDay, { color: p.text }]}>{dayLabel(section.dayStart)}</Text>
            {section.spent > 0 && <Text style={{ color: p.textMuted }}>Spent {formatINR(section.spent)}</Text>}
          </View>
        )}
        renderItem={({ item }) => {
          const label = entryLabel(item, lookups);
          const category = item.category_id != null ? lookups.categories.get(item.category_id) : undefined;
          const account = lookups.accounts.get(item.account_id);
          const recurring = recurringTxIds.has(item.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/edit/[id]', params: { id: String(item.id) } })}
              accessibilityRole="button"
              accessibilityHint="Opens the entry to edit"
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border }]}
            >
              <View style={[styles.iconBadge, { backgroundColor: p.accentSoft }]}>
                {label.icon ? (
                  <Icon name={label.icon as IconName} size={20} color={p.accent} />
                ) : (
                  <CategoryIcon icon={category?.icon ?? 'dots-horizontal-circle'} size={20} color={p.accent} />
                )}
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1}>
                  {label.title}
                </Text>
                <View style={styles.subRow}>
                  {recurring && <Icon name="repeat" size={13} color={p.accent} />}
                  <Text style={[styles.rowSub, { color: p.textMuted }]} numberOfLines={1}>
                    {recurring ? 'Recurring · ' : ''}
                    {timeLabel(item.occurred_at)}
                    {label.kind === 'transfer' ? '' : ` · ${account?.name ?? 'Account'}`}
                    {label.kind !== 'expense' && label.kind !== 'income' && item.note ? ` · ${item.note}` : ''}
                    {item.corrected_by != null ? ' · edited' : ''}
                  </Text>
                </View>
              </View>
              <Text style={[styles.amount, { color: label.sign === '+' ? p.positive : p.text }]}>
                {formatINR(item.amount_paise, { signed: label.sign === '+' })}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8 },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 8 },
  headerDay: { fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  iconBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowSub: { fontSize: 12, flexShrink: 1 },
  amount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
