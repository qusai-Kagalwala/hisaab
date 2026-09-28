import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { CategoryBars, DailyBars, FlowBars } from '../../components/charts';
import { usePalette } from '../../components/theme';
import { Card, SectionTitle } from '../../components/ui';
import { monthName } from '../../engine/calendar';
import { categoryBreakdown, dailySpending, monthlyFlows } from '../../engine/charts';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';

/** Charts: where the money goes, month by month, and day by day. */
export function InsightsScreen() {
  const p = usePalette();
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const excluded = useLedgerStore((s) => s.recurringTxIds);
  const month = useLedgerStore((s) => s.month);
  const safe = useLedgerStore((s) => s.safe);
  const insights = useLedgerStore((s) => s.insights);
  const [now] = useState(() => Date.now());

  const breakdown = useMemo(() => categoryBreakdown(transactions, categories, month, excluded), [transactions, categories, month, excluded]);
  const flows = useMemo(() => monthlyFlows(transactions, now), [transactions, now]);
  const days = useMemo(() => dailySpending(transactions, now, excluded), [transactions, now, excluded]);
  const anyFlow = flows.some((f) => f.in_paise > 0 || f.out_paise > 0);

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      {insights.map((i) => (
        <Card key={i.id}>
          <Text style={{ color: p.text, lineHeight: 20 }}>
            {i.kind === 'trend_down' ? '🌱 ' : '💡 '}
            {i.text}
          </Text>
        </Card>
      ))}

      <SectionTitle>Where it went in {monthName(month)}</SectionTitle>
      <Card>
        {breakdown.slices.length === 0 ? (
          <Text style={{ color: p.textMuted }}>No everyday spending logged this month yet.</Text>
        ) : (
          <>
            <Text style={{ color: p.textMuted }}>
              Total {formatINR(breakdown.total_paise, { paise: 'never' })} · tap a row to see its entries
            </Text>
            <CategoryBars
              slices={breakdown.slices}
              onPress={(s) => router.push({ pathname: '/history', params: { category: String(s.category_id) } })}
            />
          </>
        )}
      </Card>

      <SectionTitle>This month, day by day</SectionTitle>
      <Card>
        <DailyBars days={days} safePerDay={safe.per_day_paise} />
      </Card>

      <SectionTitle>Money in vs out</SectionTitle>
      <Card>
        {anyFlow ? <FlowBars flows={flows} /> : <Text style={{ color: p.textMuted }}>Nothing logged in the last 6 months yet.</Text>}
      </Card>
      <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
        Balance updates are left out. Bills count as money out but not as everyday spending.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
});
