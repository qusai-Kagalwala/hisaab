import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverspendCard } from '../../components/OverspendCard';
import { PendingCard } from '../../components/PendingCard';
import { SafeToSpendHero } from '../../components/SafeToSpendHero';
import { WeeklyCard } from '../../components/WeeklyCard';
import { usePalette } from '../../components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '../../components/ui';
import { monthName } from '../../engine/calendar';
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

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <SafeToSpendHero />
      {!hasEntries && (
        <Pressable onPress={() => router.push('/about')} accessibilityRole="link" style={{ alignSelf: 'center' }}>
          <Text style={{ color: p.accent, fontWeight: '600' }}>New here? See how Hisaab works ›</Text>
        </Pressable>
      )}

      <View style={styles.quickRow}>
        <Button label="Can I afford…?" variant="secondary" compact onPress={() => router.push('/afford')} style={styles.flex} />
        <Button label="💬 Ask Hisaab" variant="secondary" compact onPress={() => router.push('/chat')} style={styles.flex} />
      </View>
      <View style={styles.quickRow}>
        <Button label="📊 Insights" variant="secondary" compact onPress={() => router.push('/insights')} style={styles.flex} />
        <Button label="💡 Ideas under ₹X" variant="secondary" compact onPress={() => router.push('/ideas')} style={styles.flex} />
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
          <Text style={[styles.cardTitle, { color: p.text }]}>New month, fresh start 🎉</Text>
          <Text style={{ color: p.textMuted }}>
            Decide what happens to what&apos;s left from {monthName(rollover.fromMonth)}.
          </Text>
          <Button label="Start the month" compact onPress={() => router.push('/rollover')} />
        </Card>
      )}

      {pending.map((item) => (
        <PendingCard key={item.id} item={item} />
      ))}

      <OverspendCard />

      {insights.map((i) => (
        <Card key={i.id}>
          <Text style={{ color: p.text, lineHeight: 20 }}>
            {i.kind === 'trend_down' ? '🌱 ' : '💡 '}
            {i.text}
          </Text>
        </Card>
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
                    ? 'Reached! 🎉'
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

      <SectionTitle>This month</SectionTitle>
      <Card>
        <Row label="In your accounts" value={formatINR(picture.total_paise)} />
        <Row label="Kept for bills" value={formatINR(picture.reserved_paise)} />
        {hasBuckets && <Row label="In buckets" value={formatINR(picture.in_buckets_paise)} />}
        {picture.goals_paise > 0 && <Row label="Set aside in goals" value={formatINR(picture.goals_paise)} />}
        <Row
          label={picture.unallocated_paise >= 0 ? 'Unallocated' : 'Planned more than you have'}
          value={formatINR(Math.abs(picture.unallocated_paise))}
        />
      </Card>

      <View style={styles.links}>
        <Link href="/buckets" style={[styles.link, { color: p.accent }]}>Buckets</Link>
        <Link href="/goals" style={[styles.link, { color: p.accent }]}>Goals</Link>
        <Link href="/recurring" style={[styles.link, { color: p.accent }]}>Bills & income</Link>
        <Link href="/accounts" style={[styles.link, { color: p.accent }]}>Accounts</Link>
        <Link href="/settings" style={[styles.link, { color: p.accent }]}>Settings & backup</Link>
        <Link href="/about" style={[styles.link, { color: p.accent }]}>How it works</Link>
        <Link href="/history" style={[styles.link, { color: p.accent }]}>History</Link>
      </View>

      <Button label="＋ Add expense" onPress={() => router.dismissTo('/')} />
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
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: 8, gap: 8 },
  link: { fontSize: 15, fontWeight: '600', paddingVertical: 10, paddingHorizontal: 6 },
});
