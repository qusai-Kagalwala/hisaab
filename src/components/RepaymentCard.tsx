import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DebtStatus } from '../engine/debts';
import { formatINR } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { shortDate } from '../utils/dates';
import { savedTap } from '../utils/haptics';
import { usePalette } from './theme';
import { Button, Card } from './ui';

/** "₹3,333.34 due to Rahul — paid?" Never paid automatically: one tap confirms. */
export function RepaymentCard({ debt }: { debt: DebtStatus }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const accountName = useLedgerStore((s) => s.accounts.find((a) => a.id === s.lastAccountId)?.name);
  const settleDebt = useLedgerStore((s) => s.settleDebt);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const showUndo = useUndoStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  const due = debt.schedule.find((s) => s.status === 'due');

  const onPaid = async () => {
    if (busy || lastAccountId == null) return;
    setBusy(true);
    try {
      const amount = debt.due_now_paise;
      const id = await settleDebt(db, debt, amount, lastAccountId);
      savedTap();
      showUndo(`Repaid ${formatINR(amount)} to ${debt.person}`, async () => {
        await undoNew(db, id);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={[styles.title, { color: p.text }]}>
        {formatINR(debt.due_now_paise)} due to {debt.person} — paid?
      </Text>
      <Text style={{ color: p.textMuted }}>
        {due ? `Payment ${due.n} of ${debt.schedule.length} · ${shortDate(due.due)}` : 'Repayment'} · from {accountName ?? 'your account'}
      </Text>
      <View style={styles.row}>
        <Button label="Paid" icon="check" compact disabled={busy} onPress={onPaid} />
        <Button
          label="Other amount"
          variant="secondary"
          compact
          onPress={() => router.push({ pathname: '/people/[id]', params: { id: String(debt.id) } })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
