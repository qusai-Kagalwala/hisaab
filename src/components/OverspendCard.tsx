import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { coverCandidates } from '../engine/buckets';
import { formatINR } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { usePalette } from './theme';
import { Button, Card, Chip } from './ui';

/** "Entertainment is ₹450 over. Cover it from…?" — shown after a save, never blocking. */
export function OverspendCard() {
  const db = useSQLiteContext();
  const p = usePalette();
  const overspentId = useLedgerStore((s) => s.overspentBucketId);
  const buckets = useLedgerStore((s) => s.picture.buckets);
  const cover = useLedgerStore((s) => s.coverOverspend);
  const dismiss = useLedgerStore((s) => s.dismissOverspend);
  const saveAllocations = useLedgerStore((s) => s.saveAllocations);
  const showUndo = useUndoStore((s) => s.show);

  const over = buckets.find((b) => b.id === overspentId);
  const candidates = useMemo(() => (over ? coverCandidates(buckets, over.id) : []), [buckets, over]);
  const [picked, setPicked] = useState<number | null>(null);

  if (!over || over.remaining_paise >= 0) return null;
  const fromId = picked ?? candidates[0]?.id ?? null;

  const onCover = async () => {
    if (fromId == null) return;
    const from = candidates.find((c) => c.id === fromId);
    const { amount, previous } = await cover(db, over.id, fromId);
    setPicked(null);
    if (amount > 0) {
      showUndo(`Moved ${formatINR(amount)} from ${from?.name ?? 'bucket'}`, async () => {
        await saveAllocations(db, previous);
      });
    }
  };

  return (
    <Card>
      <Text style={[styles.title, { color: p.text }]}>
        {over.name} is {formatINR(-over.remaining_paise)} over plan
      </Text>
      {candidates.length > 0 ? (
        <>
          <Text style={{ color: p.textMuted }}>Cover it from:</Text>
          <View style={styles.row}>
            {candidates.map((c) => (
              <Chip
                key={c.id}
                label={`${c.name} · ${formatINR(c.remaining_paise, { paise: 'never' })}`}
                selected={c.id === fromId}
                onPress={() => setPicked(c.id)}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Button label="Cover" onPress={onCover} compact />
            <Button label="Later" variant="plain" onPress={dismiss} compact />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={{ color: p.textMuted, flex: 1 }}>No other bucket has money left, so it comes out of your flexible money. That&apos;s okay.</Text>
          <Button label="OK" variant="plain" onPress={dismiss} compact />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
