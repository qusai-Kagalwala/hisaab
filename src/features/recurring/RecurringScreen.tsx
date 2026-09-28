import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { usePalette } from '../../components/theme';
import { Button, SectionTitle } from '../../components/ui';
import { formatINR } from '../../engine/money';
import type { Recurring } from '../../engine/recurring';
import { useLedgerStore } from '../../store/ledgerStore';
import { dayLabel } from '../../utils/dates';
import { scheduleLabel } from './schedule';

export function RecurringScreen() {
  const p = usePalette();
  const recurring = useLedgerStore((s) => s.recurring);
  const income = recurring.filter((r) => r.type === 'income');
  const bills = recurring.filter((r) => r.type === 'expense');

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <Text style={{ color: p.textMuted }}>
        Hisaab never adds these on its own. On the due day you&apos;ll see “Expected ₹X — received?” and confirm with
        one tap. Bills still to pay this month are kept aside.
      </Text>
      <SectionTitle>Money coming in</SectionTitle>
      {income.length === 0 && <Text style={{ color: p.textMuted }}>Salary, pocket money, stipend…</Text>}
      {income.map((r) => (
        <RecurringRow key={r.id} item={r} />
      ))}
      <SectionTitle>Fixed bills</SectionTitle>
      {bills.length === 0 && <Text style={{ color: p.textMuted }}>Rent, phone recharge, fees…</Text>}
      {bills.map((r) => (
        <RecurringRow key={r.id} item={r} />
      ))}
      <Button label="＋ Add" onPress={() => router.push('/recurring/edit')} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

function RecurringRow({ item }: { item: Recurring }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const setActive = useLedgerStore((s) => s.setRecurringActive);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/recurring/edit', params: { id: String(item.id) } })}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border, opacity: item.active ? 1 : 0.6 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: p.text }]}>{item.name}</Text>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          {scheduleLabel(item.rule, item.anchor_day)}
          {item.active ? ` · next ${dayLabel(item.next_due)}` : ' · paused'}
        </Text>
      </View>
      <Text style={[styles.amount, { color: item.type === 'income' ? p.positive : p.text }]}>
        {formatINR(item.amount_paise, { signed: item.type === 'income' })}
      </Text>
      <Switch
        value={item.active}
        onValueChange={(v) => void setActive(db, item.id, v)}
        accessibilityLabel={item.active ? 'Pause' : 'Resume'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
