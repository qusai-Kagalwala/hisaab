import Slider from '@react-native-community/slider';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../components/theme';
import { Button, Card, MoneyField, ProgressBar, SectionTitle } from '../../components/ui';
import { monthKey } from '../../engine/calendar';
import { goalEta, splitContribution, type GoalStatus } from '../../engine/goals';
import { formatINR, inputToPaise, rupees } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { goBack } from '../../utils/nav';
import { monthLabel } from './goalText';

/** What-if slider range: +₹0 … +₹20,000 per month in ₹500 steps. */
const WHAT_IF_MAX_RUPEES = 20_000;
const WHAT_IF_STEP_RUPEES = 500;

export function GoalDetailScreen({ id }: { id: number }) {
  const p = usePalette();
  const goal = useLedgerStore((s) => s.goals.find((g) => g.id === id));
  if (!goal || goal.status !== 'active') {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ color: p.textMuted }}>This goal is no longer active.</Text>
      </View>
    );
  }
  return <GoalView goal={goal} />;
}

function GoalView({ goal }: { goal: GoalStatus }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const contribute = useLedgerStore((s) => s.contributeToGoal);
  const closeGoal = useLedgerStore((s) => s.closeGoal);
  const showUndo = useUndoStore((s) => s.show);

  const [now] = useState(() => Date.now());
  const [input, setInput] = useState('');
  const [extraRupees, setExtraRupees] = useState(0);
  const amount = inputToPaise(input);
  const savings = picture.buckets.find((b) => b.role === 'savings');

  let split: { fromSavings: number; fromFree: number } | null = null;
  let splitError: string | null = null;
  if (amount > 0) {
    try {
      split = splitContribution(amount, savings?.remaining_paise ?? 0, picture.unallocated_paise);
    } catch {
      const max = Math.max(savings?.remaining_paise ?? 0, 0) + Math.max(picture.unallocated_paise, 0);
      splitError = `You have ${formatINR(max)} free to put in right now.`;
    }
  }

  const extra = rupees(extraRupees);
  const whatIfEta = goalEta(goal.remaining_paise, goal.pace_paise, now, extra);

  const onAdd = async () => {
    if (!split) return;
    const undo = await contribute(db, goal.id, amount);
    setInput('');
    showUndo(`Put ${formatINR(amount)} into ${goal.name}`, undo);
  };

  const onClose = async (status: 'done' | 'removed') => {
    const undo = await closeGoal(db, goal.id, status);
    showUndo(status === 'done' ? `${goal.name} done — ${formatINR(goal.saved_paise)} is free to use` : `Removed ${goal.name}`, undo);
    goBack('/goals');
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: goal.name }} />
      <Card>
        <Text style={[styles.big, { color: p.text }]}>
          {formatINR(goal.saved_paise, { paise: 'never' })}
          <Text style={{ color: p.textMuted, fontSize: 18 }}> of {formatINR(goal.target_paise, { paise: 'never' })}</Text>
        </Text>
        <ProgressBar fraction={goal.saved_paise / goal.target_paise} />
        <Text style={{ color: p.textMuted }}>
          {goal.remaining_paise === 0
            ? 'Reached — well done!'
            : goal.eta_month
              ? `At your pace (${formatINR(goal.pace_paise, { paise: 'never' })}/month): ${goal.name} by ${monthLabel(goal.eta_month)}.`
              : 'No pace yet — put some money in to see an ETA.'}
        </Text>
        {goal.needed_per_month_paise != null && goal.target_date != null && (
          <Text style={{ color: p.textMuted }}>
            To make it by {monthLabel(monthKey(goal.target_date))}: about{' '}
            {formatINR(goal.needed_per_month_paise, { paise: 'never' })}/month.
          </Text>
        )}
      </Card>

      {goal.remaining_paise > 0 && (
        <>
          <SectionTitle>What if I save more?</SectionTitle>
          <Card>
            <Text style={{ color: p.text, fontWeight: '600' }}>+{formatINR(extra, { paise: 'never' })} a month</Text>
            <Slider
              minimumValue={0}
              maximumValue={WHAT_IF_MAX_RUPEES}
              step={WHAT_IF_STEP_RUPEES}
              value={extraRupees}
              onValueChange={(v) => setExtraRupees(Math.round(v))}
              minimumTrackTintColor={p.accent}
              maximumTrackTintColor={p.border}
              thumbTintColor={p.accent}
              accessibilityLabel="Extra saving per month"
            />
            <Text style={{ color: p.text }}>
              {whatIfEta ? `${goal.name} by ${monthLabel(whatIfEta)}` : 'Slide to see when you could get there'}
            </Text>
          </Card>
        </>
      )}

      <SectionTitle>Put money in</SectionTitle>
      <MoneyField value={input} onChange={setInput} />
      {split && (
        <Text style={{ color: p.textMuted }}>
          {split.fromSavings > 0 ? `${formatINR(split.fromSavings)} from Savings` : ''}
          {split.fromSavings > 0 && split.fromFree > 0 ? ' + ' : ''}
          {split.fromFree > 0 ? `${formatINR(split.fromFree)} from free money` : ''}
        </Text>
      )}
      {splitError && <Text style={{ color: p.text }}>{splitError}</Text>}
      <Button label="Add to goal" onPress={onAdd} disabled={!split} />

      <View style={styles.actions}>
        <Button label="Done — use the money" variant="secondary" onPress={() => onClose('done')} />
        <Button label="Remove goal" variant="plain" onPress={() => onClose('removed')} />
        <Text style={{ color: p.textMuted, fontSize: 13, textAlign: 'center' }}>
          Either way the money in it becomes free again. Log the purchase as usual.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { gap: 8, marginTop: 12 },
});
