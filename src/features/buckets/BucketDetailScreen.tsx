import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CategoryGrid } from '../../components/CategoryGrid';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, SectionTitle } from '../../components/ui';
import type { BucketStatus } from '../../engine/buckets';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { goBack } from '../../utils/nav';

export function BucketDetailScreen({ id }: { id: number }) {
  const p = usePalette();
  const bucket = useLedgerStore((s) => s.picture.buckets.find((b) => b.id === id));
  if (!bucket) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Text style={{ color: p.textMuted }}>This bucket is no longer here.</Text>
      </View>
    );
  }
  return <BucketForm bucket={bucket} />;
}

function BucketForm({ bucket }: { bucket: BucketStatus }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const categories = useLedgerStore((s) => s.categories);
  // Select the stable array, filter outside: a selector returning a new array
  // every time makes zustand re-render forever.
  const allBuckets = useLedgerStore((s) => s.picture.buckets);
  const others = useMemo(() => allBuckets.filter((b) => b.id !== bucket.id), [allBuckets, bucket.id]);
  const editBucket = useLedgerStore((s) => s.editBucket);
  const removeBuckets = useLedgerStore((s) => s.removeBuckets);
  const restoreBuckets = useLedgerStore((s) => s.restoreBuckets);
  const showUndo = useUndoStore((s) => s.show);

  const [name, setName] = useState(bucket.name);
  const [selected, setSelected] = useState<number[]>(bucket.category_ids);
  const [message, setMessage] = useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.kind === 'expense' && !c.hidden);
  const owner = (categoryId: number) => others.find((b) => b.category_ids.includes(categoryId))?.name;
  const toggle = (categoryId: number) =>
    setSelected((cur) => (cur.includes(categoryId) ? cur.filter((c) => c !== categoryId) : [...cur, categoryId]));

  const onSave = async () => {
    try {
      await editBucket(db, bucket.id, name, selected);
      goBack('/buckets');
    } catch {
      setMessage('That name is already used by another bucket.');
    }
  };

  const onRemove = async () => {
    const ids = await removeBuckets(db, [bucket.id]);
    showUndo(`Removed ${bucket.name}`, async () => {
      await restoreBuckets(db, ids);
    });
    goBack('/buckets');
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: bucket.name }} />
      <SectionTitle>Name</SectionTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={30}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <SectionTitle>Spending that draws from it</SectionTitle>
      <Text style={{ color: p.textMuted }}>
        Tap to toggle. A category belongs to one bucket; picking it here takes it off the other one.
        {bucket.role === 'flexible' ? ' Anything not picked anywhere lands here anyway.' : ''}
      </Text>
      <CategoryGrid
        categories={expenseCategories}
        highlightedId={null}
        selectedIds={selected}
        onPress={(c) => toggle(c.id)}
      />
      {selected.some((c) => owner(c)) && (
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          Moving here from:{' '}
          {selected.filter((c) => owner(c)).map((c) => `${categories.find((x) => x.id === c)?.name} (${owner(c)})`).join(', ')}
        </Text>
      )}
      {message && <Text style={{ color: p.text }}>{message}</Text>}
      <Button label="Save" onPress={onSave} disabled={!name.trim()} />
      <Button label="Remove bucket" variant="secondary" onPress={onRemove} />
      <Text style={{ color: p.textMuted, fontSize: 13, textAlign: 'center' }}>
        {bucket.remaining_paise > 0
          ? `The ${formatINR(bucket.remaining_paise)} left in it goes back to unallocated. `
          : ''}
        Past expenses stay in your history.
        {bucket.role === 'flexible' ? ' Without Flexible, other spending just isn\'t tracked in a bucket.' : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
