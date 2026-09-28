import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../components/theme';
import { Button, Chip, MoneyField, SectionTitle } from '../../components/ui';
import { formatINR, inputToPaise, paiseToInput } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { goBack } from '../../utils/nav';

export function MoveScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const buckets = useLedgerStore((s) => s.picture.buckets);
  const moveMoney = useLedgerStore((s) => s.moveMoney);
  const saveAllocations = useLedgerStore((s) => s.saveAllocations);
  const showUndo = useUndoStore((s) => s.show);

  const sources = buckets.filter((b) => b.remaining_paise > 0);
  const [fromId, setFromId] = useState<number | null>(sources[0]?.id ?? null);
  const [toId, setToId] = useState<number | null>(null);
  const [input, setInput] = useState('');

  const from = buckets.find((b) => b.id === fromId);
  const to = buckets.find((b) => b.id === toId);
  const amount = inputToPaise(input);
  const max = Math.max(from?.remaining_paise ?? 0, 0);
  const valid = !!from && !!to && from.id !== to.id && amount > 0 && amount <= max;

  const onMove = async () => {
    if (!valid || !from || !to) return;
    const previous = await moveMoney(db, from.id, to.id, amount);
    showUndo(`Moved ${formatINR(amount)} to ${to.name}`, async () => {
      await saveAllocations(db, previous);
    });
    goBack('/buckets');
  };

  if (sources.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>
          No bucket has money left to move right now.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <SectionTitle>From</SectionTitle>
      <View style={styles.chips}>
        {sources.map((b) => (
          <Chip
            key={b.id}
            label={`${b.name} · ${formatINR(b.remaining_paise, { paise: 'never' })}`}
            selected={b.id === fromId}
            onPress={() => setFromId(b.id)}
          />
        ))}
      </View>
      <SectionTitle>To</SectionTitle>
      <View style={styles.chips}>
        {buckets
          .filter((b) => b.id !== fromId)
          .map((b) => (
            <Chip key={b.id} label={b.name} selected={b.id === toId} onPress={() => setToId(b.id)} />
          ))}
      </View>
      <SectionTitle>How much</SectionTitle>
      <MoneyField value={input} onChange={setInput} />
      {from && (
        <Text style={{ color: p.textMuted }}>
          Up to {formatINR(max)} from {from.name}.{' '}
          <Text style={{ color: p.accent, fontWeight: '600' }} onPress={() => setInput(paiseToInput(max))}>
            Move all
          </Text>
        </Text>
      )}
      <Button label={to ? `Move to ${to.name}` : 'Move'} onPress={onMove} disabled={!valid} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
