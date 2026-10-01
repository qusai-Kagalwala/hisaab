import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatINR, inputToPaise } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { useUndoStore } from '../store/undoStore';
import { savedTap } from '../utils/haptics';
import { Icon } from './Icon';
import { usePalette } from './theme';
import { Button, Card, MoneyField } from './ui';

/** Money kept aside: never counted in safe to spend. Add or take out any time. */
export function SavingsCard() {
  const db = useSQLiteContext();
  const p = usePalette();
  const saved = useLedgerStore((s) => s.picture.savings_paise);
  const moveSavings = useLedgerStore((s) => s.moveSavings);
  const showUndo = useUndoStore((s) => s.show);
  const [mode, setMode] = useState<'add' | 'out' | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paise = inputToPaise(amount);

  const open = (m: 'add' | 'out') => {
    setMode(mode === m ? null : m);
    setAmount('');
    setError(null);
  };

  const onConfirm = async () => {
    if (!mode || paise <= 0 || busy) return;
    setBusy(true);
    try {
      const undo = await moveSavings(db, mode === 'add' ? paise : -paise);
      savedTap();
      showUndo(mode === 'add' ? `Put ${formatINR(paise)} in Savings` : `Took ${formatINR(paise)} out of Savings`, undo);
      setMode(null);
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: p.accentSoft }]}>
          <Icon name="piggy-bank-outline" size={24} color={p.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>Savings</Text>
          <Text style={[styles.amount, { color: p.text }]}>{formatINR(saved, { paise: 'never' })}</Text>
        </View>
      </View>
      <Text style={{ color: p.textMuted, fontSize: 13 }}>
        {saved > 0 ? 'Kept aside — never counted in safe to spend.' : 'Put money aside so you never spend it by mistake.'}
      </Text>
      <View style={styles.row}>
        <Button label="Add to savings" icon="plus" compact variant={mode === 'add' ? 'primary' : 'secondary'} onPress={() => open('add')} style={styles.flex} />
        <Button label="Take out" icon="minus" compact variant={mode === 'out' ? 'primary' : 'secondary'} onPress={() => open('out')} disabled={saved <= 0} style={styles.flex} />
      </View>
      {mode && (
        <View style={{ gap: 8 }}>
          <MoneyField value={amount} onChange={(v) => { setAmount(v); setError(null); }} autoFocus />
          {error && <Text style={{ color: p.text, fontWeight: '600' }}>{error}</Text>}
          <Button
            label={paise > 0 ? (mode === 'add' ? `Save ${formatINR(paise)}` : `Take out ${formatINR(paise)}`) : 'Enter an amount'}
            icon="check"
            compact
            disabled={busy || paise <= 0}
            onPress={onConfirm}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
