import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryBars, DailyBars, FlowBars } from '../../components/charts';
import { InsightCard } from '../../components/InsightCard';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { usePalette } from '../../components/theme';
import { Button, Card, SectionTitle } from '../../components/ui';
import { monthName, monthStartMs, shiftMonth } from '../../engine/calendar';
import { categoryBreakdown, dailySpending, monthlyFlows, monthStats, monthsWithEntries } from '../../engine/charts';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { shareCsv } from '../settings/csvFiles';

/** Charts and totals for any month: where the money went, day by day, and in vs out. */
export function InsightsScreen() {
  const p = usePalette();
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const excluded = useLedgerStore((s) => s.recurringTxIds);
  const current = useLedgerStore((s) => s.month);
  const safe = useLedgerStore((s) => s.safe);
  const insights = useLedgerStore((s) => s.insights);
  const [now] = useState(() => Date.now());
  const [picked, setPicked] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const months = useMemo(() => monthsWithEntries(transactions, current), [transactions, current]);
  const month = picked && months.includes(picked) ? picked : current;
  const isCurrent = month === current;
  // For past months, look at them as of their last moment.
  const asOf = isCurrent ? now : monthStartMs(shiftMonth(month, 1)) - 1;

  const stats = useMemo(() => monthStats(transactions, month, now, excluded), [transactions, month, now, excluded]);
  const breakdown = useMemo(() => categoryBreakdown(transactions, categories, month, excluded), [transactions, categories, month, excluded]);
  const flows = useMemo(() => monthlyFlows(transactions, asOf), [transactions, asOf]);
  const days = useMemo(() => dailySpending(transactions, asOf, excluded), [transactions, asOf, excluded]);
  const anyFlow = flows.some((f) => f.in_paise > 0 || f.out_paise > 0);
  const name = monthName(month);

  const onExport = async () => {
    try {
      const file = await shareCsv();
      setExportMsg(`Saved ${file}`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Couldn't export.");
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <MonthSwitcher months={months} value={month} onChange={setPicked} />

      <Card>
        <View style={styles.statRow}>
          <Stat label="Money in" value={formatINR(stats.in_paise, { paise: 'never' })} />
          <Stat label="Money out" value={formatINR(stats.out_paise, { paise: 'never' })} />
          <Stat
            label={stats.saved_paise >= 0 ? 'Saved' : 'Went over'}
            value={stats.saved_percent == null ? '—' : `${Math.abs(stats.saved_percent)}%`}
          />
        </View>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          {stats.saved_percent == null
            ? `No money in logged for ${name}.`
            : stats.saved_paise >= 0
              ? `You kept ${formatINR(stats.saved_paise, { paise: 'never' })} of what came in.`
              : `${formatINR(-stats.saved_paise, { paise: 'never' })} more went out than came in this month.`}
        </Text>
      </Card>

      {isCurrent && insights.map((i) => <InsightCard key={i.id} insight={i} />)}

      <SectionTitle>Where it went in {name}</SectionTitle>
      <Card>
        {breakdown.slices.length === 0 ? (
          <Text style={{ color: p.textMuted }}>No everyday spending logged in {name}.</Text>
        ) : (
          <>
            <Text style={{ color: p.textMuted }}>
              Total {formatINR(breakdown.total_paise, { paise: 'never' })} · tap a row to see its entries
            </Text>
            <CategoryBars
              slices={breakdown.slices}
              onPress={(s) =>
                router.push({ pathname: '/history', params: { category: s.category_id != null && s.category_id > 0 ? String(s.category_id) : '', month } })
              }
            />
          </>
        )}
      </Card>

      <SectionTitle>{name}, day by day</SectionTitle>
      <Card>
        <DailyBars days={days} safePerDay={isCurrent ? safe.per_day_paise : 0} />
        {stats.everyday_paise > 0 && (
          <View style={styles.facts}>
            <Fact label="Average a day" value={formatINR(stats.average_per_day_paise, { paise: 'never' })} />
            {stats.top_days.length > 0 && (
              <Fact
                label="Biggest days"
                value={stats.top_days.map((d) => `${d.day} ${name.slice(0, 3)} · ${formatINR(d.paise, { paise: 'never' })}`).join('\n')}
              />
            )}
            {stats.largest && (
              <Fact
                label="Largest single spend"
                value={`${formatINR(stats.largest.amount_paise, { paise: 'never' })}${stats.largest.note ? ` · ${stats.largest.note}` : ''}`}
              />
            )}
          </View>
        )}
      </Card>

      <SectionTitle>Money in vs out</SectionTitle>
      <Card>
        {anyFlow ? <FlowBars flows={flows} /> : <Text style={{ color: p.textMuted }}>Nothing logged in these 6 months.</Text>}
      </Card>
      <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
        Balance updates, moves between accounts and borrow &amp; lend are left out. Bills count as money out but not as
        everyday spending.
      </Text>

      <Button label="Download all entries (spreadsheet)" icon="file-delimited-outline" variant="secondary" compact onPress={onExport} />
      {exportMsg && <Text style={{ color: p.textMuted, textAlign: 'center', fontSize: 13 }}>{exportMsg}</Text>}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.stat}>
      <Text style={{ color: p.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={[styles.statValue, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.fact}>
      <Text style={{ color: p.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={[styles.factValue, { color: p.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  facts: { gap: 8, marginTop: 8 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factValue: { fontWeight: '600', textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
});
