import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PendingItem } from '../db/moneyQueries';
import { formatINR, inputToPaise, paiseToInput } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { dayLabel } from '../utils/dates';
import { savedTap } from '../utils/haptics';
import { AccountChips } from './AccountChips';
import { usePalette } from './theme';
import { Button, Card, MoneyField } from './ui';

/** "Expected ₹30,000 into SBI — received?" [Confirm] [Edit amount] [Skip]; the account can be changed for this time. */
export function PendingCard({ item }: { item: PendingItem }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const [accountId, setAccountId] = useState(item.account_id);
  const [pickAccount, setPickAccount] = useState(false);
  const accountName = accounts.find((a) => a.id === accountId)?.name;
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
      savedTap();
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
        Expected {formatINR(item.amount_paise)} {isIncome ? 'into' : 'from'} {accountName ?? 'which account?'} —{' '}
        {isIncome ? 'received?' : 'paid?'}
      </Text>
      <Text style={{ color: p.textMuted }}>
        {item.name} · due {dayLabel(item.due_date)}
        {!pickAccount && (
          <Text onPress={() => setPickAccount(true)} accessibilityRole="button" style={{ color: p.accent, fontWeight: '600' }}>
            {'  '}Change account
          </Text>
        )}
      </Text>
      {(pickAccount || !accountName) && <AccountChips accounts={accounts} selectedId={accountName ? accountId : null} onSelect={setAccountId} />}
      {editing && <MoneyField value={input} onChange={setInput} autoFocus />}
      <View style={styles.row}>
        <Button
          label={editing ? `Confirm ${formatINR(amount)}` : 'Confirm'}
          compact
          disabled={busy || amount <= 0 || !accountName}
          onPress={() =>
            run(
              () => confirm(db, { ...item, account_id: accountId }, amount),
              `${isIncome ? 'Added' : 'Paid'} ${formatINR(amount)} · ${item.name} · ${accountName}`,
            )
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
