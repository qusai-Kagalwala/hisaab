import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PendingItem } from '../db/moneyQueries';
import { formatINR, inputToPaise, paiseToInput } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { dayLabel } from '../utils/dates';
import { usePalette } from './theme';
import { Button, Card, MoneyField } from './ui';

/** "Expected ₹30,000 — received?" [Confirm] [Edit amount] [Skip] */
export function PendingCard({ item }: { item: PendingItem }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const accountName = useLedgerStore((s) => s.accounts.find((a) => a.id === item.account_id)?.name);
  const confirm = useLedgerStore((s) => s.confirmPending);
  const skip = useLedgerStore((s) => s.skipPending);
  const reopen = useLedgerStore((s) => s.reopenPending);
  const showUndo = useUndoStore((s) => s.show);

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(paiseToInput(item.amount_paise));
  const [busy, setBusy] = useState(false);
  const amount = editing ? inputToPaise(input) : item.amount_paise;
  const isIncome = item.type === 'income';

  const run = async (action: () => Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      showUndo(message, async () => {
        await reopen(db, item.id);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={[styles.title, { color: p.text }]}>
        Expected {formatINR(item.amount_paise)} — {isIncome ? 'received?' : 'paid?'}
      </Text>
      <Text style={{ color: p.textMuted }}>
        {item.name} · due {dayLabel(item.due_date)} · {accountName ?? 'Account'}
      </Text>
      {editing && <MoneyField value={input} onChange={setInput} autoFocus />}
      <View style={styles.row}>
        <Button
          label={editing ? `Confirm ${formatINR(amount)}` : 'Confirm'}
          compact
          disabled={busy || amount <= 0}
          onPress={() =>
            run(() => confirm(db, item, amount), `${isIncome ? 'Added' : 'Paid'} ${formatINR(amount)} · ${item.name}`)
          }
        />
        {!editing && <Button label="Edit amount" variant="secondary" compact onPress={() => setEditing(true)} />}
        <Button
          label="Skip"
          variant="plain"
          compact
          disabled={busy}
          onPress={() => run(() => skip(db, item.id), `Skipped ${item.name}`)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
