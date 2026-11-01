import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatINR, inputToPaise } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { savedTap } from '../utils/haptics';
import { AccountChips } from './AccountChips';
import { Icon } from './Icon';
import { usePalette } from './theme';
import { Button, Card, MoneyField } from './ui';

/**
 * Savings: money handed over (e.g. to family). It leaves an account and then
 * belongs to no account, so it never counts in any balance or safe to spend.
 */
export function SavingsCard() {
  const db = useSQLiteContext();
  const p = usePalette();
  const savings = useLedgerStore((s) => s.savings);
  const accounts = useLedgerStore((s) => s.accounts);
  const balances = useLedgerStore((s) => s.balances);
  const defaultAccount = useLedgerStore((s) => s.spotlightId ?? s.lastAccountId ?? s.accounts[0]?.id ?? null);
  const putInSavings = useLedgerStore((s) => s.putInSavings);
  const takeFromSavings = useLedgerStore((s) => s.takeFromSavings);
  const settleOldSavings = useLedgerStore((s) => s.settleOldSavings);
  const showUndo = useUndoStore((s) => s.show);
  const [mode, setMode] = useState<'add' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [settleId, setSettleId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paise = inputToPaise(amount);
  const accountId = picked ?? defaultAccount;
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? 'account';

  const open = (m: 'add' | 'out') => {
    setMode(mode === m ? null : m);
    setAmount('');
    setPicked(null);
    setError(null);
  };

  const run = async (task: () => Promise<() => Promise<void>>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const undo = await task();
      savedTap();
      showUndo(message, undo);
      setMode(null);
      setAmount('');
      setPicked(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => {
    if (!mode || paise <= 0 || accountId == null) return;
    void run(
      () => (mode === 'add' ? putInSavings(db, accountId, paise) : takeFromSavings(db, accountId, paise)),
      mode === 'add' ? `${formatINR(paise)} from ${accountName} → Savings` : `${formatINR(paise)} from Savings → ${accountName}`,
    );
  };

  return (
    <Card>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: p.accentSoft }]}>
          <Icon name="piggy-bank-outline" size={24} color={p.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>Savings</Text>
          <Text style={[styles.amount, { color: p.text }]}>{formatINR(savings.total_paise, { paise: 'never' })}</Text>
        </View>
      </View>
      <Text style={{ color: p.textMuted, fontSize: 13 }}>
        {savings.total_paise > 0
          ? 'Handed over — not in any account, never counted in safe to spend.'
          : 'Money you hand over (like to family) leaves your account and is kept here.'}
      </Text>

      {savings.legacy_paise > 0 && (
        <View style={[styles.settle, { borderColor: p.border, backgroundColor: p.surface }]}>
          <Text style={{ color: p.text, fontWeight: '600' }}>
            {formatINR(savings.legacy_paise, { paise: 'never' })} of this is still counted inside your accounts.
          </Text>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>Which account did it come out of? Its balance will go down by that much.</Text>
          <AccountChips accounts={accounts} selectedId={settleId} onSelect={setSettleId} />
          <Button
            label={settleId == null ? 'Pick the account' : `Take it out of ${accounts.find((a) => a.id === settleId)?.name ?? 'account'}`}
            icon="check"
            compact
            disabled={busy || settleId == null}
            onPress={() => settleId != null && run(() => settleOldSavings(db, settleId), 'Savings now kept outside your accounts')}
          />
        </View>
      )}

      <Button label="Put in Savings" icon="plus" compact variant={mode === 'add' ? 'primary' : 'secondary'} onPress={() => open('add')} />
      {mode && (
        <View style={{ gap: 8 }}>
          <MoneyField value={amount} onChange={(v) => { setAmount(v); setError(null); }} autoFocus />
          <Text style={{ color: p.textMuted, fontSize: 13 }}>{mode === 'add' ? 'From' : 'Into'}</Text>
          <AccountChips accounts={accounts} selectedId={accountId} onSelect={(id) => { setPicked(id); setError(null); }} />
          {mode === 'add' && accountId != null && (
            <Text style={{ color: p.textMuted, fontSize: 12 }}>
              {accountName} has {formatINR(balances.get(accountId) ?? 0, { paise: 'never' })}
            </Text>
          )}
          {error && <Text style={{ color: p.text, fontWeight: '600' }}>{error}</Text>}
          <Button
            label={paise > 0 ? (mode === 'add' ? `Put ${formatINR(paise)} in Savings` : `Take back ${formatINR(paise)}`) : 'Enter an amount'}
            icon="check"
            compact
            disabled={busy || paise <= 0 || accountId == null}
            onPress={onConfirm}
          />
        </View>
      )}
      {savings.total_paise > 0 && mode !== 'out' && (
        <Pressable onPress={() => open('out')} accessibilityRole="button" hitSlop={8} style={styles.takeBack}>
          <Text style={{ color: p.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>Take money back from Savings</Text>
        </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  settle: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  takeBack: { alignSelf: 'center', paddingVertical: 6 },
});
