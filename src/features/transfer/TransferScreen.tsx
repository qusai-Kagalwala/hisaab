import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccountChips } from '../../components/AccountChips';
import { Icon } from '../../components/Icon';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, MoneyField, SectionTitle } from '../../components/ui';
import { formatINR, inputToPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { goBack } from '../../utils/nav';

/** Bank → Cash (an ATM withdrawal) and the like: not spending, not income. */
export function TransferScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const accounts = useLedgerStore((s) => s.accounts);
  const balances = useLedgerStore((s) => s.balances);
  const transfer = useLedgerStore((s) => s.transfer);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const showUndo = useUndoStore((s) => s.show);

  const cash = accounts.find((a) => a.type === 'cash');
  const bank = accounts.find((a) => a.type === 'upi_bank');
  const [fromId, setFromId] = useState<number | null>(
    params.from ? Number(params.from) : bank?.id ?? accounts[0]?.id ?? null,
  );
  const [toId, setToId] = useState<number | null>(
    params.to ? Number(params.to) : (cash && cash.id !== fromId ? cash.id : accounts.find((a) => a.id !== fromId)?.id) ?? null,
  );
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paise = inputToPaise(amount);
  const name = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '';

  if (accounts.length < 2) {
    return (
      <View style={[styles.empty, { backgroundColor: p.background }]}>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>
          You need two accounts to move money between them. Add one in Accounts.
        </Text>
      </View>
    );
  }

  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const onSave = async () => {
    if (busy || fromId == null || toId == null) return;
    if (fromId === toId) return setError('Pick two different accounts');
    if (paise <= 0) return setError('Enter an amount');
    setBusy(true);
    try {
      const id = await transfer(db, fromId, toId, paise, note);
      showUndo(`Moved ${formatINR(paise)} · ${name(fromId)} → ${name(toId)}`, async () => {
        await undoNew(db, id);
      });
      goBack('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={{ color: p.textMuted }}>
        Moving money between your own accounts isn&apos;t spending, so your totals stay the same.
      </Text>
      <SectionTitle>From</SectionTitle>
      <AccountChips accounts={accounts} selectedId={fromId} onSelect={(id) => { setFromId(id); setError(null); }} />
      <Text style={{ color: p.textMuted, fontSize: 13 }}>{name(fromId)} has {formatINR(balances.get(fromId ?? -1) ?? 0)}</Text>
      <Pressable onPress={swap} accessibilityRole="button" accessibilityLabel="Swap from and to" style={[styles.swap, { borderColor: p.border }]}>
        <Icon name="swap-vertical" size={20} color={p.accent} />
        <Text style={{ color: p.accent, fontWeight: '600' }}>Swap</Text>
      </Pressable>
      <SectionTitle>To</SectionTitle>
      <AccountChips accounts={accounts} selectedId={toId} onSelect={(id) => { setToId(id); setError(null); }} />
      <SectionTitle>How much</SectionTitle>
      <MoneyField value={amount} onChange={(v) => { setAmount(v); setError(null); }} autoFocus />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional, e.g. ATM)"
        placeholderTextColor={p.textMuted}
        maxLength={120}
        style={[styles.note, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      {error && <Text style={{ color: p.text }}>{error}</Text>}
      <Button
        label={paise > 0 && fromId !== toId ? `Move ${formatINR(paise)}` : 'Move money'}
        icon="swap-horizontal"
        onPress={onSave}
        disabled={busy || paise <= 0 || fromId === toId}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  note: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
