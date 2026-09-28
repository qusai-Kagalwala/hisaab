import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CategoryGrid } from '../../components/CategoryGrid';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, SectionTitle } from '../../components/ui';
import type { BucketStatus } from '../../engine/buckets';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

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
  const others = useLedgerStore((s) => s.picture.buckets.filter((b) => b.id !== bucket.id));
  const editBucket = useLedgerStore((s) => s.editBucket);
  const deleteBucket = useLedgerStore((s) => s.deleteBucket);
  const restoreBucket = useLedgerStore((s) => s.restoreBucket);
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
      router.back();
    } catch {
      setMessage('That name is already used by another bucket.');
    }
  };

  const onDelete = async () => {
    const ok = await deleteBucket(db, bucket.id);
    if (!ok) {
      setMessage(
        bucket.role
          ? `${bucket.name} is a built-in bucket, so it stays. You can set it to ₹0.`
          : 'This bucket already has spending this month, so it stays. You can set it to ₹0.',
      );
      return;
    }
    showUndo(`Removed ${bucket.name}`, async () => {
      await restoreBucket(db, bucket);
    });
    router.back();
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
      {bucket.role == null && <Button label="Remove bucket" variant="plain" onPress={onDelete} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
