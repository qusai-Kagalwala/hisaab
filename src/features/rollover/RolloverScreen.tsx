import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../components/theme';
import { Button, Card, Chip } from '../../components/ui';
import { monthName } from '../../engine/calendar';
import { formatINR } from '../../engine/money';
import { choicesFor, leftoverBuckets, type RolloverChoice } from '../../engine/rollover';
import { useLedgerStore } from '../../store/ledgerStore';

const LABEL: Record<RolloverChoice, string> = {
  keep: 'Keep in bucket',
  savings: 'Move to Savings',
  flexible: 'Move to Flexible',
};

export function RolloverScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const rollover = useLedgerStore((s) => s.rollover);
  const applyRollover = useLedgerStore((s) => s.applyRollover);
  const [choices, setChoices] = useState<Map<number, RolloverChoice>>(
    () => new Map(rollover?.buckets.map((b) => [b.id, rollover.remembered.get(b.name) ?? 'keep']) ?? []),
  );
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!rollover) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ color: p.textMuted }}>All set for this month.</Text>
      </View>
    );
  }

  const leftovers = leftoverBuckets(rollover.buckets);
  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await applyRollover(db, choices, remember);
      router.replace('/buckets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.lead, { color: p.text }]}>
        {leftovers.length > 0
          ? `Nice — some money is left from ${monthName(rollover.fromMonth)}. Where should it go?`
          : `${monthName(rollover.fromMonth)} is done. Your buckets carry over with a fresh start.`}
      </Text>
      {leftovers.map((b) => (
        <Card key={b.id}>
          <View style={styles.between}>
            <Text style={[styles.name, { color: p.text }]}>{b.name}</Text>
            <Text style={[styles.name, { color: p.text }]}>{formatINR(b.remaining_paise)} left</Text>
          </View>
          <View style={styles.chips}>
            {choicesFor(b, rollover.buckets).map((c) => (
              <Chip
                key={c}
                label={LABEL[c]}
                selected={(choices.get(b.id) ?? 'keep') === c}
                onPress={() => setChoices((cur) => new Map(cur).set(b.id, c))}
              />
            ))}
          </View>
        </Card>
      ))}
      {leftovers.length > 0 && (
        <Pressable
          onPress={() => setRemember((r) => !r)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remember }}
          style={styles.remember}
        >
          <View style={[styles.box, { borderColor: p.accent, backgroundColor: remember ? p.accent : 'transparent' }]}>
            {remember && <Text style={{ color: p.accentText, fontWeight: '800' }}>✓</Text>}
          </View>
          <Text style={{ color: p.text, flex: 1 }}>Remember my choices and do this automatically next month</Text>
        </Pressable>
      )}
      <Text style={{ color: p.textMuted, fontSize: 13 }}>
        Overspent buckets start fresh. New plans start at ₹0 — divide your money when it comes in.
      </Text>
      <Button label="Start the month" onPress={onStart} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 16, lineHeight: 22 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
