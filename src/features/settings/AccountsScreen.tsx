import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, MoneyField } from '../../components/ui';
import { formatINR, inputToPaise, paiseToInput } from '../../engine/money';
import type { Account, AccountType } from '../../engine/types';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

const TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Cash',
  upi_bank: 'UPI / Bank',
  other: 'Other',
};

export function AccountsScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const balances = useLedgerStore((s) => s.balances);
  const addAccount = useLedgerStore((s) => s.addAccount);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('other');

  const onAdd = async () => {
    if (!name.trim()) return;
    await addAccount(db, name, type);
    setName('');
    setType('other');
  };

  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.caption, { color: p.textMuted }]}>
        Balances are worked out from what you log. Tap a balance to set what&apos;s really there right now; tap a
        name to rename it.
      </Text>
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} balance={balances.get(a.id) ?? 0} />
      ))}

      <Text style={[styles.sectionTitle, { color: p.text }]}>Add an account</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Wallet, Savings bank"
        placeholderTextColor={p.textMuted}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={onAdd}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <View style={styles.typeRow}>
        {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: type === t }}
            style={[
              styles.typeChip,
              { borderColor: type === t ? p.accent : p.border, backgroundColor: type === t ? p.accentSoft : p.surface },
            ]}
          >
            <Text style={{ color: type === t ? p.accent : p.text }}>{TYPE_LABEL[t]}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={onAdd}
        disabled={!name.trim()}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: p.accent, opacity: name.trim() ? 1 : 0.5 }]}
      >
        <Text style={[styles.primaryText, { color: p.accentText }]}>Add account</Text>
      </Pressable>
    </ScrollView>
  );
}

function AccountRow({ account, balance }: { account: Account; balance: number }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const renameAccount = useLedgerStore((s) => s.renameAccount);
  const adjustBalance = useLedgerStore((s) => s.adjustBalance);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const showUndo = useUndoStore((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.name);
  const [updating, setUpdating] = useState(false);
  const [actual, setActual] = useState('');

  const onUpdateBalance = async () => {
    const id = await adjustBalance(db, account.id, inputToPaise(actual));
    setUpdating(false);
    if (id != null) {
      showUndo(`${account.name} set to ${formatINR(inputToPaise(actual))}`, async () => {
        await undoNew(db, id);
      });
    }
  };

  const commit = async () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== account.name) await renameAccount(db, account.id, draft);
    else setDraft(account.name);
  };

  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            maxLength={40}
            onBlur={commit}
            onSubmitEditing={commit}
            style={[styles.rowName, styles.rowInput, { color: p.text, borderColor: p.accent }]}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityHint="Rename account">
            <Text style={[styles.rowName, { color: p.text }]}>{account.name}</Text>
          </Pressable>
        )}
        <Text style={{ color: p.textMuted, fontSize: 12 }}>{TYPE_LABEL[account.type]}</Text>
      </View>
      <Pressable
        onPress={() => {
          setActual(balance > 0 ? paiseToInput(balance) : '');
          setUpdating((u) => !u);
        }}
        accessibilityRole="button"
        accessibilityHint="Update balance"
        hitSlop={8}
      >
        <Text style={[styles.balance, { color: p.text }]}>{formatINR(balance)}</Text>
        <Text style={{ color: p.accent, fontSize: 12, textAlign: 'right' }}>Update</Text>
      </Pressable>
    </View>
    {updating && (
      <View style={styles.update}>
        <Text style={{ color: p.textMuted }}>How much is in {account.name} right now?</Text>
        <MoneyField value={actual} onChange={setActual} autoFocus />
        <Button label="Set balance" compact onPress={onUpdateBalance} />
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 10, paddingBottom: 40 },
  caption: { fontSize: 13, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  update: { gap: 8, marginTop: 10 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowInput: { borderBottomWidth: 1, paddingVertical: 2 },
  balance: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  primary: { minHeight: MIN_TAP + 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
});
