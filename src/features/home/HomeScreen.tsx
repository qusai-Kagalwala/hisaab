import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { OverspendCard } from '../../components/OverspendCard';
import { InsightCard } from '../../components/InsightCard';
import { PendingCard } from '../../components/PendingCard';
import { RepaymentCard } from '../../components/RepaymentCard';
import { SafeToSpendHero } from '../../components/SafeToSpendHero';
import { WeeklyCard } from '../../components/WeeklyCard';
import { usePalette } from '../../components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '../../components/ui';
import { monthName } from '../../engine/calendar';
import { monthStats } from '../../engine/charts';
import { debtTotals, visibleDebts } from '../../engine/debts';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { monthLabel } from '../goals/goalText';

export function HomeScreen() {
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const pending = useLedgerStore((s) => s.pending);
  const rollover = useLedgerStore((s) => s.rollover);
  const hasEntries = useLedgerStore((s) => s.transactions.length > 0);
  const hasBuckets = picture.buckets.length > 0;
  const insights = useLedgerStore((s) => s.insights);
  const goals = useLedgerStore((s) => s.goals);
  const activeGoals = goals.filter((g) => g.status === 'active');
  const bucketsOff = useLedgerStore((s) => s.bucketsOff);
  const debts = useLedgerStore((s) => s.debts);
  const transactions = useLedgerStore((s) => s.transactions);
  const excluded = useLedgerStore((s) => s.recurringTxIds);
  const month = useLedgerStore((s) => s.month);
  const [now] = useState(() => Date.now());
  const dueDebts = useMemo(() => debts.filter((d) => d.kind === 'borrowed' && d.due_now_paise > 0), [debts]);
  const people = useMemo(() => debtTotals(visibleDebts(debts)), [debts]);
  const stats = useMemo(() => monthStats(transactions, month, now, excluded), [transactions, month, now, excluded]);

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <SafeToSpendHero />
      {!hasEntries && (
        <Pressable onPress={() => router.push('/about')} accessibilityRole="link" style={{ alignSelf: 'center' }}>
          <Text style={{ color: p.accent, fontWeight: '600' }}>New here? See how Hisaab works ›</Text>
        </Pressable>
      )}

      <View style={styles.quickRow}>
        <Button label="Can I afford?" icon="scale" variant="secondary" compact onPress={() => router.push('/afford')} style={styles.flex} />
        <Button label="Ask Hisaab" icon="message-text-outline" variant="secondary" compact onPress={() => router.push('/chat')} style={styles.flex} />
      </View>
      <View style={styles.quickRow}>
        <Button label="Borrow & lend" icon="hand-coin-outline" variant="secondary" compact onPress={() => router.push('/people')} style={styles.flex} />
        <Button label="Move money" icon="swap-horizontal" variant="secondary" compact onPress={() => router.push('/transfer')} style={styles.flex} />
      </View>

      <WeeklyCard />

      {!hasEntries && (
        <Card>
          <Text style={[styles.cardTitle, { color: p.text }]}>Tell Hisaab what you have</Text>
          <Text style={{ color: p.textMuted }}>
            Enter how much is in your wallet and bank right now. Everything else is worked out from there.
          </Text>
          <Button label="Update balances" variant="secondary" compact onPress={() => router.push('/accounts')} />
        </Card>
      )}

      {rollover && (
        <Card>
          <Text style={[styles.cardTitle, { color: p.text }]}>New month, fresh start</Text>
          <Text style={{ color: p.textMuted }}>
            Decide what happens to what&apos;s left from {monthName(rollover.fromMonth)}.
          </Text>
          <Button label="Start the month" compact onPress={() => router.push('/rollover')} />
        </Card>
      )}

      {pending.map((item) => (
        <PendingCard key={item.id} item={item} />
      ))}

      {dueDebts.map((d) => (
        <RepaymentCard key={d.id} debt={d} />
      ))}

      <OverspendCard />

      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}

      {hasBuckets && picture.unallocated_paise > 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: p.text }]}>
            You have {formatINR(picture.unallocated_paise, { paise: 'never' })} unallocated
          </Text>
          <Text style={{ color: p.textMuted }}>Divide it into buckets? Or leave it — it counts as free money.</Text>
          <Button label="Divide" variant="secondary" compact onPress={() => router.push('/buckets/plan')} />
        </Card>
      )}

      {!hasBuckets && !rollover && !bucketsOff && hasEntries && picture.unallocated_paise > 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: p.text }]}>
            You have {formatINR(picture.unallocated_paise, { paise: 'never' })} unallocated
          </Text>
          <Text style={{ color: p.textMuted }}>Divide it into buckets? Totally optional.</Text>
          <Button label="Try buckets" variant="secondary" compact onPress={() => router.push('/buckets')} />
        </Card>
      )}

      {hasBuckets && (
        <>
          <SectionTitle>Buckets</SectionTitle>
          {picture.buckets.map((b) => (
            <Pressable key={b.id} onPress={() => router.push('/buckets')} accessibilityRole="button">
              <View style={styles.bucketRow}>
                <View style={styles.bucketText}>
                  <Text style={[styles.bucketName, { color: p.text }]}>{b.name}</Text>
                  <Text style={{ color: p.textMuted, fontSize: 13 }}>
                    {b.remaining_paise >= 0
                      ? `${formatINR(b.remaining_paise, { paise: 'never' })} of ${formatINR(b.allocated_paise, { paise: 'never' })} left`
                      : `${formatINR(-b.remaining_paise, { paise: 'never' })} over`}
                  </Text>
                </View>
                <ProgressBar
                  fraction={b.allocated_paise > 0 ? b.remaining_paise / b.allocated_paise : 0}
                  muted={b.remaining_paise <= 0}
                />
              </View>
            </Pressable>
          ))}
        </>
      )}

      <SectionTitle>Goals</SectionTitle>
      {activeGoals.length === 0 ? (
        <Pressable onPress={() => router.push('/goals')} accessibilityRole="button">
          <Text style={{ color: p.textMuted }}>Saving up for something? Add a goal and see when you&apos;ll get there ›</Text>
        </Pressable>
      ) : (
        activeGoals.slice(0, 3).map((g) => (
          <Pressable
            key={g.id}
            onPress={() => router.push({ pathname: '/goals/[id]', params: { id: String(g.id) } })}
            accessibilityRole="button"
          >
            <View style={styles.bucketRow}>
              <View style={styles.bucketText}>
                <Text style={[styles.bucketName, { color: p.text }]}>{g.name}</Text>
                <Text style={{ color: p.textMuted, fontSize: 13 }}>
                  {g.remaining_paise === 0
                    ? 'Reached!'
                    : g.eta_month
                      ? `by ${monthLabel(g.eta_month)}`
                      : `${formatINR(g.saved_paise, { paise: 'never' })} of ${formatINR(g.target_paise, { paise: 'never' })}`}
                </Text>
              </View>
              <ProgressBar fraction={g.saved_paise / g.target_paise} />
            </View>
          </Pressable>
        ))
      )}

      {(people.you_owe_paise > 0 || people.owed_to_you_paise > 0) && (
        <Pressable onPress={() => router.push('/people')} accessibilityRole="button">
          <Card style={styles.peopleCard}>
            <Icon name="hand-coin-outline" size={22} color={p.accent} />
            <Text style={{ color: p.text, flex: 1 }}>
              {[
                people.you_owe_paise > 0 ? `You owe ${formatINR(people.you_owe_paise, { paise: 'never' })}` : null,
                people.owed_to_you_paise > 0 ? `Owed to you ${formatINR(people.owed_to_you_paise, { paise: 'never' })}` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
            <Icon name="chevron-right" size={20} color={p.textMuted} />
          </Card>
        </Pressable>
      )}

      <SectionTitle>This month</SectionTitle>
      <Card>
        <Row label="In your accounts" value={formatINR(picture.total_paise)} />
        <Row label="Kept for bills" value={formatINR(picture.reserved_paise)} />
        {picture.repayments_paise > 0 && <Row label="Kept for repayments" value={formatINR(picture.repayments_paise)} />}
        {hasBuckets && <Row label="In buckets" value={formatINR(picture.in_buckets_paise)} />}
        {picture.goals_paise > 0 && <Row label="Set aside in goals" value={formatINR(picture.goals_paise)} />}
        <Row
          label={picture.unallocated_paise >= 0 ? 'Unallocated' : 'Planned more than you have'}
          value={formatINR(Math.abs(picture.unallocated_paise))}
        />
      </Card>

      {stats.in_paise > 0 && (
        <Pressable onPress={() => router.navigate('/insights')} accessibilityRole="button">
          <Card style={styles.peopleCard}>
            <Icon name="chart-box-outline" size={22} color={p.accent} />
            <Text style={{ color: p.text, flex: 1 }}>
              {stats.saved_paise >= 0
                ? `So far you've kept ${stats.saved_percent}% of what came in this month`
                : `This month ${formatINR(-stats.saved_paise, { paise: 'never' })} more went out than came in`}
            </Text>
            <Icon name="chevron-right" size={20} color={p.textMuted} />
          </Card>
        </Pressable>
      )}

      <View style={styles.links}>
        <Button label="Accounts" icon="wallet-outline" variant="plain" compact onPress={() => router.push('/accounts')} />
        <Button label="Bills & income" icon="calendar-sync" variant="plain" compact onPress={() => router.push('/recurring')} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={{ color: p.textMuted }}>{label}</Text>
      <Text style={[styles.rowValue, { color: p.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  bucketRow: { gap: 6, paddingVertical: 6 },
  bucketText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bucketName: { fontSize: 15, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowValue: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  peopleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
