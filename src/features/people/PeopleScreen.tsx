import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '../../components/ui';
import { debtTotals, visibleDebts, type DebtStatus } from '../../engine/debts';
import { formatINR, subtractPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { shortDate } from '../../utils/dates';

/** Borrow & lend: who you owe, who owes you. Never counted as spending or income. */
export function PeopleScreen() {
  const p = usePalette();
  const all = useLedgerStore((s) => s.debts);
  const [showSettled, setShowSettled] = useState(false);
  const debts = useMemo(() => visibleDebts(all), [all]);
  const totals = useMemo(() => debtTotals(debts), [debts]);
  const owe = debts.filter((d) => d.kind === 'borrowed' && !d.settled);
  const owed = debts.filter((d) => d.kind === 'lent' && !d.settled);
  const settled = debts.filter((d) => d.settled);

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Card style={styles.flex}>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>You owe</Text>
          <Text style={[styles.total, { color: p.text }]}>{formatINR(totals.you_owe_paise, { paise: 'never' })}</Text>
        </Card>
        <Card style={styles.flex}>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>Owed to you</Text>
          <Text style={[styles.total, { color: p.text }]}>{formatINR(totals.owed_to_you_paise, { paise: 'never' })}</Text>
        </Card>
      </View>
      <View style={styles.row}>
        <Button label="I borrowed" icon="hand-coin-outline" onPress={() => router.push({ pathname: '/people/new', params: { kind: 'borrowed' } })} style={styles.flex} />
        <Button label="I lent" icon="hand-coin-outline" variant="secondary" onPress={() => router.push({ pathname: '/people/new', params: { kind: 'lent' } })} style={styles.flex} />
      </View>

      {debts.length === 0 && (
        <Text style={{ color: p.textMuted, lineHeight: 20 }}>
          Borrowed from a friend, or lent someone money? Note it here. It moves money in or out of your account without
          counting as spending or income, and borrowed money can get a simple no-interest repayment plan.
        </Text>
      )}

      {owe.length > 0 && <SectionTitle>You owe</SectionTitle>}
      {owe.map((d) => <DebtRow key={d.id} debt={d} />)}
      {owed.length > 0 && <SectionTitle>Owed to you</SectionTitle>}
      {owed.map((d) => <DebtRow key={d.id} debt={d} />)}

      {settled.length > 0 && (
        <Pressable onPress={() => setShowSettled((v) => !v)} accessibilityRole="button" style={styles.toggle}>
          <Text style={{ color: p.accent, fontWeight: '600' }}>
            {showSettled ? 'Hide' : 'Show'} settled ({settled.length})
          </Text>
        </Pressable>
      )}
      {showSettled && settled.map((d) => <DebtRow key={d.id} debt={d} />)}
    </ScrollView>
  );
}

function DebtRow({ debt }: { debt: DebtStatus }) {
  const p = usePalette();
  const borrowed = debt.kind === 'borrowed';
  const sub = debt.settled
    ? borrowed ? 'All repaid' : 'All paid back'
    : debt.due_now_paise > 0
      ? `${formatINR(debt.due_now_paise)} due now`
      : debt.next
        ? `Next: ${formatINR(subtractPaise(debt.next.amount_paise, debt.next.paid_paise))} on ${shortDate(debt.next.due)}`
        : borrowed ? 'No fixed plan' : `${formatINR(debt.settled_paise)} back so far`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/people/[id]', params: { id: String(debt.id) } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border }]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.name, { color: p.text }]}>{debt.person}</Text>
        <Text style={[styles.amount, { color: p.text }]}>
          {formatINR(debt.settled ? debt.principal_paise : debt.outstanding_paise)}
        </Text>
      </View>
      <ProgressBar fraction={debt.principal_paise > 0 ? debt.settled_paise / debt.principal_paise : 0} muted={debt.settled} />
      <Text style={{ color: debt.due_now_paise > 0 ? p.accent : p.textMuted, fontSize: 13, fontWeight: debt.due_now_paise > 0 ? '600' : '400' }}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  total: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  toggle: { alignSelf: 'center', paddingVertical: 10 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
