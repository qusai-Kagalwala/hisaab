import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccountChips } from '../../components/AccountChips';
import { CategoryGrid } from '../../components/CategoryGrid';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Chip, MoneyField, SectionTitle } from '../../components/ui';
import { CATEGORY_ID } from '../../engine/defaults';
import { inputToPaise, paiseToInput } from '../../engine/money';
import type { RecurringRule } from '../../engine/recurring';
import { useLedgerStore } from '../../store/ledgerStore';
import { WEEKDAYS } from './schedule';
import { goBack } from '../../utils/nav';
import { useScreenTitle } from '../../utils/useScreenTitle';

export function RecurringEditScreen({ id }: { id: number | null }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const existing = useLedgerStore((s) => (id == null ? undefined : s.recurring.find((r) => r.id === id)));
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const add = useLedgerStore((s) => s.addRecurring);
  const update = useLedgerStore((s) => s.updateRecurring);

  const [type, setType] = useState<'income' | 'expense'>(existing?.type ?? 'income');
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing ? paiseToInput(existing.amount_paise) : '');
  const [accountId, setAccountId] = useState(existing?.account_id ?? lastAccountId ?? accounts[0]?.id ?? 1);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.category_id ?? CATEGORY_ID.salary);
  const [rule, setRule] = useState<RecurringRule>(existing?.rule ?? 'monthly');
  const [anchor, setAnchor] = useState(existing?.anchor_day ?? new Date().getDate());
  const [busy, setBusy] = useState(false);

  const visible = categories.filter((c) => c.kind === type && !c.hidden);
  const amountPaise = inputToPaise(amount);
  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? '';
  const valid = amountPaise > 0 && (name.trim() || categoryName);

  const switchType = (t: 'income' | 'expense') => {
    setType(t);
    setCategoryId(t === 'income' ? CATEGORY_ID.salary : CATEGORY_ID.rent);
  };
  const switchRule = (r: RecurringRule) => {
    setRule(r);
    setAnchor(r === 'weekly' ? new Date().getDay() : new Date().getDate());
  };

  const onSave = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const input = {
        type, name: name.trim() || categoryName, amount_paise: amountPaise, account_id: accountId,
        category_id: categoryId, rule, anchor_day: anchor,
      };
      if (existing) await update(db, existing.id, input);
      else await add(db, input);
      goBack('/recurring');
    } finally {
      setBusy(false);
    }
  };

  useScreenTitle(existing ? 'Edit' : 'Add bill or income');
  return (
    <ScrollView
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.chips}>
        <Chip label="Money in" selected={type === 'income'} onPress={() => switchType('income')} />
        <Chip label="Bill to pay" selected={type === 'expense'} onPress={() => switchType('expense')} />
      </View>
      <SectionTitle>Amount</SectionTitle>
      <MoneyField value={amount} onChange={setAmount} autoFocus={!existing} />
      <SectionTitle>What is it?</SectionTitle>
      <CategoryGrid categories={visible} highlightedId={categoryId} onPress={(c) => setCategoryId(c.id)} />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={`Name (optional, e.g. ${type === 'income' ? 'Salary' : 'Room rent'})`}
        placeholderTextColor={p.textMuted}
        maxLength={40}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      <SectionTitle>Repeats</SectionTitle>
      <View style={styles.chips}>
        <Chip label="Monthly" selected={rule === 'monthly'} onPress={() => switchRule('monthly')} />
        <Chip label="Weekly" selected={rule === 'weekly'} onPress={() => switchRule('weekly')} />
      </View>
      {rule === 'weekly' ? (
        <View style={styles.chips}>
          {WEEKDAYS.map((d, i) => (
            <Chip key={d} label={d.slice(0, 3)} selected={anchor === i} onPress={() => setAnchor(i)} />
          ))}
        </View>
      ) : (
        <View style={styles.dayRow}>
          <Text style={{ color: p.text }}>On day</Text>
          <Button label="−" variant="secondary" compact onPress={() => setAnchor((d) => Math.max(1, d - 1))} />
          <Text style={[styles.day, { color: p.text }]}>{anchor}</Text>
          <Button label="＋" variant="secondary" compact onPress={() => setAnchor((d) => Math.min(31, d + 1))} />
          <Text style={{ color: p.textMuted, flex: 1 }}>{anchor > 28 ? 'Short months use their last day' : 'of each month'}</Text>
        </View>
      )}
      <SectionTitle>{type === 'income' ? 'Comes into' : 'Paid from'}</SectionTitle>
      <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
      <Button label="Save" onPress={onSave} disabled={!valid || busy} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  day: { fontSize: 22, fontWeight: '700', minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
