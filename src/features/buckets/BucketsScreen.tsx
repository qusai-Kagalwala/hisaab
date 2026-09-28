import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '../../components/ui';
import { BUCKET_TEMPLATES, type TemplateId } from '../../engine/buckets';
import { formatINR } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

export function BucketsScreen() {
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const rollover = useLedgerStore((s) => s.rollover);

  if (picture.buckets.length === 0) {
    return rollover ? (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        <Card>
          <Text style={[styles.title, { color: p.text }]}>New month</Text>
          <Text style={{ color: p.textMuted }}>First decide what happens to last month&apos;s leftovers.</Text>
          <Button label="Start the month" compact onPress={() => router.replace('/rollover')} />
        </Card>
      </View>
    ) : (
      <TemplatePicker />
    );
  }
  return <BucketsOverview />;
}

function TemplatePicker() {
  const db = useSQLiteContext();
  const p = usePalette();
  const unallocated = useLedgerStore((s) => s.picture.unallocated_paise);
  const setupBuckets = useLedgerStore((s) => s.setupBuckets);
  const categories = useLedgerStore((s) => s.categories);
  const [busy, setBusy] = useState(false);

  const pick = async (id: TemplateId) => {
    if (busy) return;
    setBusy(true);
    try {
      await setupBuckets(db, id);
      router.push('/buckets/plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.lead, { color: p.text }]}>
        Buckets are a plan for money you haven&apos;t spent yet. They&apos;re optional — skip them and everything
        still works.
      </Text>
      <Text style={{ color: p.textMuted }}>
        You have {formatINR(Math.max(unallocated, 0), { paise: 'never' })} to plan with. Pick a starting point — you
        can change every number and name after.
      </Text>
      {BUCKET_TEMPLATES.map((t) => (
        <Pressable key={t.id} onPress={() => pick(t.id)} disabled={busy} accessibilityRole="button">
          {({ pressed }) => (
            <Card style={pressed && { backgroundColor: p.surfacePressed }}>
              <Text style={[styles.title, { color: p.text }]}>{t.label}</Text>
              <Text style={{ color: p.textMuted }}>{t.description}</Text>
              {t.id !== 'custom' && (
                <Text style={{ color: p.text }}>
                  {t.buckets.map((b) => `${b.name} ${b.percent}%`).join(' · ')}
                </Text>
              )}
              {t.buckets.some((b) => b.category_ids.length > 0) && (
                <Text style={{ color: p.textMuted, fontSize: 12 }}>
                  {t.buckets
                    .filter((b) => b.category_ids.length > 0)
                    .map((b) => `${b.name}: ${b.category_ids.map((id) => categories.find((c) => c.id === id)?.icon ?? '').join('')}`)
                    .join('   ')}
                </Text>
              )}
            </Card>
          )}
        </Pressable>
      ))}
      <Text style={[styles.note, { color: p.textMuted }]}>
        Templates are a starting point, not advice. Your situation is yours.
      </Text>
    </ScrollView>
  );
}

function BucketsOverview() {
  const db = useSQLiteContext();
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const categories = useLedgerStore((s) => s.categories);
  const addBucket = useLedgerStore((s) => s.addBucket);
  const removeBuckets = useLedgerStore((s) => s.removeBuckets);
  const restoreBuckets = useLedgerStore((s) => s.restoreBuckets);
  const showUndo = useUndoStore((s) => s.show);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await addBucket(db, name);
      setNewName('');
      setError(null);
    } catch {
      setError('You already have a bucket with that name.');
    }
  };

  const onRemove = async (id: number, name: string) => {
    const ids = await removeBuckets(db, [id]);
    showUndo(`Removed ${name}`, async () => {
      await restoreBuckets(db, ids);
    });
  };

  const onTurnOff = async () => {
    const ids = await removeBuckets(db);
    showUndo('Buckets turned off', async () => {
      await restoreBuckets(db, ids);
    });
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={styles.between}>
          <Text style={{ color: p.textMuted }}>
            {picture.unallocated_paise >= 0 ? 'Unallocated' : 'Planned more than you have'}
          </Text>
          <Text style={[styles.title, { color: p.text }]}>{formatINR(Math.abs(picture.unallocated_paise))}</Text>
        </View>
        {picture.unallocated_paise < 0 && (
          <Text style={{ color: p.textMuted, fontSize: 13 }}>
            Upcoming bills need this money. Lower a bucket in Plan to balance it out.
          </Text>
        )}
        <View style={styles.actions}>
          <Button label="Plan / divide" compact onPress={() => router.push('/buckets/plan')} style={styles.flex} />
          <Button label="Move money" variant="secondary" compact onPress={() => router.push('/buckets/move')} style={styles.flex} />
        </View>
      </Card>

      {picture.buckets.map((b) => (
        <Card key={b.id}>
          <Pressable
            onPress={() => router.push({ pathname: '/buckets/[id]', params: { id: String(b.id) } })}
            accessibilityRole="button"
            accessibilityHint="Edit name and categories"
            style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.between}>
              <Text style={[styles.title, { color: p.text }]}>
                {b.name}
                {b.role && b.name.toLowerCase() !== b.role ? `  · ${b.role}` : ''}
              </Text>
              <Text style={[styles.amount, { color: p.text }]}>
                {b.remaining_paise >= 0 ? formatINR(b.remaining_paise, { paise: 'never' }) : `${formatINR(-b.remaining_paise, { paise: 'never' })} over`}
              </Text>
            </View>
            <ProgressBar
              fraction={b.allocated_paise > 0 ? b.remaining_paise / b.allocated_paise : 0}
              muted={b.remaining_paise <= 0}
            />
          </Pressable>
          <View style={styles.between}>
            <Text style={{ color: p.textMuted, fontSize: 13, flex: 1 }}>
              Planned {formatINR(b.allocated_paise, { paise: 'never' })} · spent {formatINR(b.spent_paise, { paise: 'never' })}
              {'   '}
              {b.category_ids.map((id) => categories.find((c) => c.id === id)?.icon ?? '').join(' ')}
            </Text>
            <Pressable
              onPress={() => onRemove(b.id, b.name)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${b.name}`}
              style={styles.remove}
            >
              <Text style={{ color: p.textMuted, fontSize: 13, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        </Card>
      ))}

      <SectionTitle>Add a bucket</SectionTitle>
      <View style={styles.actions}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Trip, Gifts"
          placeholderTextColor={p.textMuted}
          maxLength={30}
          onSubmitEditing={onAdd}
          style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
        />
        <Button label="Add" compact onPress={onAdd} disabled={!newName.trim()} />
      </View>
      {error && <Text style={{ color: p.textMuted }}>{error}</Text>}
      <Text style={[styles.note, { color: p.textMuted }]}>
        Expenses go to the bucket their category belongs to; anything else draws from Flexible.
      </Text>
      <Button label="Turn off buckets" variant="plain" onPress={onTurnOff} />
      <Text style={[styles.note, { color: p.textMuted }]}>
        Turning them off keeps your history. Money in them goes back to unallocated, and you can set them up again
        any time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', padding: 16 },
  lead: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, textAlign: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  remove: { paddingVertical: 6, paddingLeft: 12 },
  cardMain: { gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
