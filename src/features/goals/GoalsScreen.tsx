import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Card, MoneyField, ProgressBar, SectionTitle } from '../../components/ui';
import { monthKey, monthStartMs, shiftMonth } from '../../engine/calendar';
import { formatINR, inputToPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { monthLabel } from './goalText';

export function GoalsScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const goals = useLedgerStore((s) => s.goals);
  const addGoal = useLedgerStore((s) => s.addGoal);

  const [now] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  // Optional target month, as months from now (0 = none).
  const [monthsAhead, setMonthsAhead] = useState(0);
  const targetPaise = inputToPaise(target);
  const targetMonth = monthsAhead > 0 ? shiftMonth(monthKey(now), monthsAhead) : null;

  const onAdd = async () => {
    if (!name.trim() || targetPaise <= 0) return;
    const id = await addGoal(db, {
      name,
      target_paise: targetPaise,
      target_date: targetMonth ? monthStartMs(targetMonth) : null,
    });
    setName('');
    setTarget('');
    setMonthsAhead(0);
    router.push({ pathname: '/goals/[id]', params: { id: String(id) } });
  };

  const active = goals.filter((g) => g.status === 'active');
  const done = goals.filter((g) => g.status === 'done');

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {active.length === 0 && (
        <Text style={{ color: p.textMuted }}>
          A goal is something you&apos;re saving up for — a laptop, a trip, an emergency fund. Money you put in is set
          aside, so it&apos;s not counted as free to spend.
        </Text>
      )}
      {active.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => router.push({ pathname: '/goals/[id]', params: { id: String(g.id) } })}
          accessibilityRole="button"
        >
          {({ pressed }) => (
            <Card style={pressed && { backgroundColor: p.surfacePressed }}>
              <View style={styles.between}>
                <Text style={[styles.title, { color: p.text }]}>{g.name}</Text>
                <Text style={{ color: p.text, fontWeight: '600' }}>
                  {formatINR(g.saved_paise, { paise: 'never' })} / {formatINR(g.target_paise, { paise: 'never' })}
                </Text>
              </View>
              <ProgressBar fraction={g.target_paise > 0 ? g.saved_paise / g.target_paise : 0} />
              <Text style={{ color: p.textMuted, fontSize: 13 }}>
                {g.remaining_paise === 0
                  ? 'Reached! 🎉'
                  : g.eta_month
                    ? `${g.name} by ${monthLabel(g.eta_month)} at your pace`
                    : 'Put some money in to see when you’ll get there'}
              </Text>
            </Card>
          )}
        </Pressable>
      ))}

      <SectionTitle>New goal</SectionTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="What for? e.g. Laptop"
        placeholderTextColor={p.textMuted}
        maxLength={40}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <MoneyField value={target} onChange={setTarget} placeholder="Target amount" />
      <View style={styles.row}>
        <Text style={{ color: p.text }}>By</Text>
        <Button label="−" variant="secondary" compact onPress={() => setMonthsAhead((m) => Math.max(0, m - 1))} />
        <Text style={[styles.month, { color: p.text }]}>{targetMonth ? monthLabel(targetMonth) : 'no date'}</Text>
        <Button label="＋" variant="secondary" compact onPress={() => setMonthsAhead((m) => Math.min(120, m + 1))} />
      </View>
      <Button label="Create goal" onPress={onAdd} disabled={!name.trim() || targetPaise <= 0} />

      {done.length > 0 && (
        <>
          <SectionTitle>Done</SectionTitle>
          {done.map((g) => (
            <Text key={g.id} style={{ color: p.textMuted }}>
              ✓ {g.name} · {formatINR(g.target_paise, { paise: 'never' })}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { fontSize: 16, fontWeight: '700' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  month: { fontSize: 15, fontWeight: '600', minWidth: 120, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
