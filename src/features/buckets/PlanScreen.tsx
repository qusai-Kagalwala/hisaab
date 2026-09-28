import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Card, Chip, MoneyField } from '../../components/ui';
import { percentOf, splitByPercent } from '../../engine/buckets';
import { addPaise, formatINR, inputToPaise, paiseToInput, subtractPaise, type Paise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

type Mode = 'percent' | 'rupees';

/**
 * Divide the month's money across buckets, by % or ₹ — both always shown.
 * The pool is everything planned so far plus what is still unallocated.
 */
export function PlanScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const buckets = useLedgerStore((s) => s.picture.buckets);
  const poolRaw = useLedgerStore((s) => s.picture.plan_pool_paise);
  const saveAllocations = useLedgerStore((s) => s.saveAllocations);
  const showUndo = useUndoStore((s) => s.show);
  const pool = Math.max(poolRaw, 0);

  const [mode, setMode] = useState<Mode>('percent');
  const [amounts, setAmounts] = useState<Paise[]>(() => buckets.map((b) => b.allocated_paise));
  const [percents, setPercents] = useState<number[]>(() => buckets.map((b) => percentOf(b.allocated_paise, pool)));
  const [rupeeText, setRupeeText] = useState<string[]>(() => buckets.map((b) => paiseToInput(b.allocated_paise)));

  const percentTotal = percents.reduce((a, b) => a + b, 0);
  const planned = addPaise(...amounts);
  const left = subtractPaise(pool, planned);
  const tooMuch = mode === 'percent' ? percentTotal > 100 : left < 0;

  const setPercent = (i: number, text: string) => {
    const value = Math.min(parseInt(text.replace(/\D/g, '') || '0', 10), 100);
    const next = percents.map((v, k) => (k === i ? value : v));
    setPercents(next);
    if (next.reduce((a, b) => a + b, 0) <= 100) {
      const parts = splitByPercent(pool, next);
      setAmounts(parts);
      setRupeeText(parts.map(paiseToInput));
    }
  };

  const setRupees = (i: number, text: string) => {
    const nextText = rupeeText.map((v, k) => (k === i ? text : v));
    setRupeeText(nextText);
    const next = nextText.map(inputToPaise);
    setAmounts(next);
    setPercents(next.map((a) => percentOf(a, pool)));
  };

  const onSave = async () => {
    if (tooMuch) return;
    const previous = await saveAllocations(db, buckets.map((b, i) => ({ id: b.id, allocated_paise: amounts[i] })));
    showUndo('Plan saved', async () => {
      await saveAllocations(db, previous);
    });
    router.back();
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <Text style={{ color: p.textMuted }}>Money to plan this month</Text>
        <Text style={[styles.pool, { color: p.text }]}>{formatINR(pool)}</Text>
        <View style={styles.row}>
          <Chip label="By %" selected={mode === 'percent'} onPress={() => setMode('percent')} />
          <Chip label="By ₹" selected={mode === 'rupees'} onPress={() => setMode('rupees')} />
        </View>
      </Card>

      {buckets.map((b, i) => (
        <View key={b.id} style={[styles.bucket, { borderColor: p.border, backgroundColor: p.surface }]}>
          <View style={styles.bucketHead}>
            <Text style={[styles.name, { color: p.text }]}>{b.name}</Text>
            <Text style={{ color: p.textMuted }}>
              {mode === 'percent' ? formatINR(amounts[i]) : `${percents[i]}%`}
            </Text>
          </View>
          {mode === 'percent' ? (
            <View style={styles.percentField}>
              <TextInput
                value={String(percents[i])}
                onChangeText={(t) => setPercent(i, t)}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                style={[styles.percentInput, { color: p.text, borderColor: p.border }]}
              />
              <Text style={{ color: p.textMuted, fontSize: 18 }}>%</Text>
            </View>
          ) : (
            <MoneyField value={rupeeText[i]} onChange={(t) => setRupees(i, t)} />
          )}
          {b.spent_paise > 0 && (
            <Text style={{ color: p.textMuted, fontSize: 12 }}>Already spent {formatINR(b.spent_paise)}</Text>
          )}
        </View>
      ))}

      <Card>
        {tooMuch ? (
          <Text style={{ color: p.text, fontWeight: '600' }}>
            {mode === 'percent'
              ? `That's ${percentTotal}% — bring it down to 100% or less.`
              : `That's ${formatINR(-left)} more than you have — lower a bucket a little.`}
          </Text>
        ) : (
          <Text style={{ color: p.text }}>
            Left unplanned: <Text style={{ fontWeight: '700' }}>{formatINR(left)}</Text>
            <Text style={{ color: p.textMuted }}> (counts as free money)</Text>
          </Text>
        )}
      </Card>
      <Button label="Save plan" onPress={onSave} disabled={tooMuch} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  pool: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8 },
  bucket: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 8 },
  bucketHead: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '600' },
  percentField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  percentInput: { borderWidth: 1, borderRadius: 12, minHeight: MIN_TAP, width: 90, fontSize: 18, textAlign: 'center' },
});
