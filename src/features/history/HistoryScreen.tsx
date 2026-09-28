import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { CategoryIcon } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { groupByDay } from '../../engine/ledger';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { dayLabel, timeLabel } from '../../utils/dates';

export function HistoryScreen() {
  const p = usePalette();
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const accounts = useLedgerStore((s) => s.accounts);
  const { category } = useLocalSearchParams<{ category?: string }>();
  const categoryFilter = category != null ? Number(category) : null;

  const sections = useMemo(
    () =>
      groupByDay(categoryFilter == null ? transactions : transactions.filter((t) => t.category_id === categoryFilter)).map(
        (g) => ({ ...g, data: g.transactions }),
      ),
    [transactions, categoryFilter],
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filterTitle =
    categoryFilter != null ? categories.find((c) => c.id === categoryFilter)?.name ?? 'History' : 'History';

  if (sections.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: p.background }]}>
        <Stack.Screen options={{ title: filterTitle }} />
        <Text style={[styles.emptyTitle, { color: p.text }]}>Nothing logged yet</Text>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>
          Your entries will show up here. Go back and log your first chai.
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.list}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={<Stack.Screen options={{ title: filterTitle }} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.header}>
          <Text style={[styles.headerDay, { color: p.text }]}>{dayLabel(section.dayStart)}</Text>
          {section.spent > 0 && (
            <Text style={{ color: p.textMuted }}>Spent {formatINR(section.spent)}</Text>
          )}
        </View>
      )}
      renderItem={({ item }) => {
        const category = item.category_id != null ? categoryById.get(item.category_id) : undefined;
        const account = accountById.get(item.account_id);
        const isIncome = item.type === 'income';
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/edit/[id]', params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityHint="Opens the entry to edit"
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border },
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: p.accentSoft }]}>
              <CategoryIcon icon={category?.icon ?? 'dots-horizontal-circle'} size={20} color={p.accent} />
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={1}>
                {item.note || category?.name || 'Uncategorised'}
              </Text>
              <Text style={[styles.rowSub, { color: p.textMuted }]} numberOfLines={1}>
                {timeLabel(item.occurred_at)} · {account?.name ?? 'Account'}
                {item.corrected_by != null ? ' · edited' : ''}
              </Text>
            </View>
            <Text style={[styles.amount, { color: isIncome ? p.positive : p.text }]}>
              {formatINR(item.amount_paise, { signed: isIncome })}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 40 },
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
  rowSub: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
