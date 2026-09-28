import { Link, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverspendCard } from '../../components/OverspendCard';
import { PendingCard } from '../../components/PendingCard';
import { usePalette } from '../../components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '../../components/ui';
import { monthName } from '../../engine/calendar';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';

export function HomeScreen() {
  const p = usePalette();
  const safe = useLedgerStore((s) => s.safe);
  const picture = useLedgerStore((s) => s.picture);
  const pending = useLedgerStore((s) => s.pending);
  const rollover = useLedgerStore((s) => s.rollover);
  const hasEntries = useLedgerStore((s) => s.transactions.length > 0);
  const hasBuckets = picture.buckets.length > 0;

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={[styles.heroLabel, { color: p.textMuted }]}>Safe to spend today</Text>
        <Text style={[styles.heroAmount, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatINR(safe.per_day_paise, { paise: 'never' })}
        </Text>
        <Text style={[styles.heroSub, { color: p.textMuted }]}>
          {safe.over_paise > 0
            ? `You're ${formatINR(safe.over_paise, { paise: 'never' })} over plan this month. A small rebalance fixes it.`
            : `${formatINR(safe.pool_paise, { paise: 'never' })} free for the next ${safe.days_left} ${safe.days_left === 1 ? 'day' : 'days'}`}
        </Text>
      </View>

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

      {hasBuckets && picture.unallocated_paise > 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: p.text }]}>
            You have {formatINR(picture.unallocated_paise, { paise: 'never' })} unallocated
          </Text>
          <Text style={{ color: p.textMuted }}>Divide it into buckets? Or leave it — it counts as free money.</Text>
          <Button label="Divide" variant="secondary" compact onPress={() => router.push('/buckets/plan')} />
        </Card>
      )}

      {!hasBuckets && !rollover && hasEntries && picture.unallocated_paise > 0 && (
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

      <SectionTitle>This month</SectionTitle>
      <Card>
        <Row label="In your accounts" value={formatINR(picture.total_paise)} />
        <Row label="Kept for bills" value={formatINR(picture.reserved_paise)} />
        {hasBuckets && <Row label="In buckets" value={formatINR(picture.in_buckets_paise)} />}
        <Row
          label={picture.unallocated_paise >= 0 ? 'Unallocated' : 'Planned more than you have'}
          value={formatINR(Math.abs(picture.unallocated_paise))}
        />
      </Card>

      <View style={styles.links}>
        <Link href="/buckets" style={[styles.link, { color: p.accent }]}>Buckets</Link>
        <Link href="/recurring" style={[styles.link, { color: p.accent }]}>Bills & income</Link>
        <Link href="/accounts" style={[styles.link, { color: p.accent }]}>Accounts</Link>
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
  hero: { alignItems: 'center', paddingVertical: 16 },
  heroLabel: { fontSize: 15, fontWeight: '500' },
  heroAmount: { fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  bucketRow: { gap: 6, paddingVertical: 6 },
  bucketText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bucketName: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowValue: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: 8, gap: 8 },
  link: { fontSize: 15, fontWeight: '600', paddingVertical: 10, paddingHorizontal: 6 },
});
