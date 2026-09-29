import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccountChips } from '../../components/AccountChips';
import { CategoryGrid } from '../../components/CategoryGrid';
import { Keypad } from '../../components/Keypad';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Chip } from '../../components/ui';
import { monthKey } from '../../engine/calendar';
import { applyKeypadKey, formatINR, formatKeypadInput, inputToPaise, paiseToInput } from '../../engine/money';
import type { EffectiveTransaction } from '../../engine/types';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { dayLabel, timeLabel } from '../../utils/dates';
import { goBack } from '../../utils/nav';

interface Props {
  id: number;
}

/**
 * Editing never changes the original row: saving appends a correction entry,
 * and delete appends a correction with amount 0. Both can be undone for 5s by
 * appending another correction that restores the previous values.
 */
export function EditTransactionScreen({ id }: Props) {
  const tx = useLedgerStore((s) => s.transactions.find((t) => t.id === id));
  const p = usePalette();

  if (!tx || tx.voided) {
    return (
      <View style={[styles.missing, { backgroundColor: p.background }]}>
        <Stack.Screen options={{ title: 'Entry' }} />
        <Text style={{ color: p.textMuted }}>This entry is no longer available.</Text>
      </View>
    );
  }
  return tx.type === 'transfer' ? <TransferEditForm tx={tx} /> : <EditForm tx={tx} />;
}

/** Accounts to pick from: the ones in use, plus the entry's own if it was removed since. */
function useAccountChoices(accountId: number, toAccountId?: number | null) {
  const all = useLedgerStore((s) => s.allAccounts);
  return useMemo(
    () => all.filter((a) => !a.archived || a.id === accountId || a.id === toAccountId),
    [all, accountId, toAccountId],
  );
}

/** Edit a move between accounts, or a borrow/lend entry. Same rules: a correction, never an overwrite. */
function TransferEditForm({ tx }: { tx: EffectiveTransaction }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const correct = useLedgerStore((s) => s.correct);
  const debt = useLedgerStore((s) => (tx.debt_id != null ? s.debts.find((d) => d.id === tx.debt_id) : undefined));
  const showUndo = useUndoStore((s) => s.show);
  const accounts = useAccountChoices(tx.account_id, tx.to_account_id);
  const [input, setInput] = useState(paiseToInput(tx.amount_paise));
  const [accountId, setAccountId] = useState(tx.account_id);
  const [toId, setToId] = useState<number | null>(tx.to_account_id ?? null);
  const [note, setNote] = useState(tx.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountPaise = inputToPaise(input);
  const isMove = tx.debt_id == null;
  const title = isMove
    ? 'Edit move'
    : debt?.kind === 'lent'
      ? tx.direction === 'out' ? `Lent to ${debt.person}` : `${debt.person} paid back`
      : tx.direction === 'in' ? `Borrowed from ${debt?.person ?? ''}` : `Repaid ${debt?.person ?? ''}`;
  const previous = {
    account_id: tx.account_id, category_id: null, amount_paise: tx.amount_paise, note: tx.note,
    to_account_id: tx.to_account_id ?? null,
  };
  const restore = async () => {
    const latest = useLedgerStore.getState().transactions.find((t) => t.id === tx.id);
    if (latest) await correct(db, latest, previous);
  };

  const run = async (next: typeof previous, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await correct(db, tx, next);
      if (id != null) showUndo(message, restore);
      goBack('/history');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title }} />
      <Text style={[styles.when, { color: p.textMuted }]}>
        {dayLabel(tx.occurred_at)}, {timeLabel(tx.occurred_at)}
      </Text>
      <Text style={[styles.amount, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatKeypadInput(input)}
      </Text>
      <Text style={{ color: p.textMuted }}>{isMove ? 'From' : tx.direction === 'in' ? 'Came into' : 'Went from'}</Text>
      <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
      {isMove && (
        <>
          <Text style={{ color: p.textMuted }}>To</Text>
          <AccountChips accounts={accounts} selectedId={toId} onSelect={setToId} />
        </>
      )}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={p.textMuted}
        maxLength={120}
        style={[styles.note, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <Keypad onKey={(key) => setInput((prev) => applyKeypadKey(prev, key))} onClear={() => setInput('')} />
      {error && <Text style={{ color: p.text, fontWeight: '600' }}>{error}</Text>}
      <Pressable
        onPress={() => run({ account_id: accountId, category_id: null, amount_paise: amountPaise, note, to_account_id: isMove ? toId : null }, `Updated to ${formatINR(amountPaise)}`)}
        disabled={busy || amountPaise <= 0 || (isMove && toId === accountId)}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: p.accent, opacity: amountPaise > 0 && !(isMove && toId === accountId) ? 1 : 0.5 }]}
      >
        <Text style={[styles.primaryText, { color: p.accentText }]}>Save changes</Text>
      </Pressable>
      <Pressable
        onPress={() => run({ ...previous, amount_paise: 0 }, `Deleted ${formatINR(tx.amount_paise)}`)}
        disabled={busy}
        accessibilityRole="button"
        style={styles.secondary}
      >
        <Text style={{ color: p.textMuted, fontSize: 15 }}>Delete entry</Text>
      </Pressable>
    </ScrollView>
  );
}

function EditForm({ tx }: { tx: EffectiveTransaction }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useAccountChoices(tx.account_id);
  const categories = useLedgerStore((s) => s.categories);
  const correct = useLedgerStore((s) => s.correct);
  const showUndo = useUndoStore((s) => s.show);

  const allBuckets = useLedgerStore((s) => s.allBuckets);
  const kind = tx.type === 'income' ? 'income' : 'expense';
  // Buckets of the month the entry happened in; only expenses draw from buckets.
  const monthBuckets = useMemo(
    () => (kind === 'expense' ? allBuckets.filter(
            (b) => b.period_month === monthKey(tx.occurred_at) && (!b.removed || b.id === tx.bucket_id),
          ) : []),
    [allBuckets, kind, tx.occurred_at, tx.bucket_id],
  );
  const [bucketId, setBucketId] = useState<number | null>(tx.bucket_id);
  const [input, setInput] = useState(paiseToInput(tx.amount_paise));
  const [categoryId, setCategoryId] = useState(tx.category_id);
  const [accountId, setAccountId] = useState(tx.account_id);
  const [note, setNote] = useState(tx.note ?? '');
  const [busy, setBusy] = useState(false);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.hidden),
    [categories, kind],
  );
  const amountPaise = inputToPaise(input);
  const previous = {
    account_id: tx.account_id,
    category_id: tx.category_id,
    amount_paise: tx.amount_paise,
    note: tx.note,
    bucket_id: tx.bucket_id,
  };

  /** Restore `previous` by appending another correction on top of the latest state. */
  const restore = async () => {
    const latest = useLedgerStore.getState().transactions.find((t) => t.id === tx.id);
    if (latest) await correct(db, latest, previous);
  };

  const onSave = async () => {
    if (busy || amountPaise <= 0) return;
    setBusy(true);
    try {
      const correctionId = await correct(db, tx, {
        account_id: accountId,
        category_id: categoryId,
        amount_paise: amountPaise,
        note,
        bucket_id: bucketId,
      });
      if (correctionId != null) showUndo(`Updated to ${formatINR(amountPaise)}`, restore);
      goBack('/history');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await correct(db, tx, { ...previous, amount_paise: 0 });
      showUndo(`Deleted ${formatINR(tx.amount_paise)}`, restore);
      goBack('/history');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: kind === 'income' ? 'Edit money in' : 'Edit expense' }} />
      <Text style={[styles.when, { color: p.textMuted }]}>
        {dayLabel(tx.occurred_at)}, {timeLabel(tx.occurred_at)}
      </Text>
      <Text style={[styles.amount, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatKeypadInput(input)}
      </Text>

      <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
      <CategoryGrid
        categories={visibleCategories}
        highlightedId={categoryId}
        onPress={(c) => setCategoryId(c.id)}
      />
      {monthBuckets.length > 0 && (
        <View style={styles.chips}>
          <Text style={{ color: p.textMuted }}>From bucket:</Text>
          {monthBuckets.map((b) => (
            <Chip key={b.id} label={b.name} selected={bucketId === b.id} onPress={() => setBucketId(b.id)} />
          ))}
          <Chip label="None" selected={bucketId == null} onPress={() => setBucketId(null)} />
        </View>
      )}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={p.textMuted}
        maxLength={120}
        style={[styles.note, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <Keypad onKey={(key) => setInput((prev) => applyKeypadKey(prev, key))} onClear={() => setInput('')} />

      <Pressable
        onPress={onSave}
        disabled={busy || amountPaise <= 0}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: p.accent, opacity: amountPaise > 0 ? 1 : 0.5 }]}
      >
        <Text style={[styles.primaryText, { color: p.accentText }]}>Save changes</Text>
      </Pressable>
      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" style={styles.secondary}>
        <Text style={{ color: p.textMuted, fontSize: 15 }}>Delete entry</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  when: { textAlign: 'center', marginTop: 4 },
  amount: { fontSize: 44, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  note: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
  primary: { minHeight: MIN_TAP + 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
});
