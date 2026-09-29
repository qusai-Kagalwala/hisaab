import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AccountChips } from '../../components/AccountChips';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Chip, MoneyField, SectionTitle } from '../../components/ui';
import { firstDueDate, knownPeople, type DebtKind } from '../../engine/debts';
import { formatINR, inputToPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { draftFirstDue, draftPlan, PlanEditor, type PlanDraft } from './PlanEditor';
import { useScreenTitle } from '../../utils/useScreenTitle';

export function NewDebtScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const params = useLocalSearchParams<{ kind?: string; person?: string }>();
  const accounts = useLedgerStore((s) => s.accounts);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const debts = useLedgerStore((s) => s.debts);
  const recordDebt = useLedgerStore((s) => s.recordDebt);
  const undoDebt = useLedgerStore((s) => s.undoDebt);
  const showUndo = useUndoStore((s) => s.show);

  const [now] = useState(() => Date.now());
  const [kind, setKind] = useState<DebtKind>(params.kind === 'lent' ? 'lent' : 'borrowed');
  const [person, setPerson] = useState(params.person ?? '');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | null>(lastAccountId);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<PlanDraft>({ mode: 'months', months: 3, perMonth: '', day: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => knownPeople(debts).slice(0, 6), [debts]);
  const total = inputToPaise(amount);
  const baseFirstDue = firstDueDate(now);
  const name = person.trim();

  const onSave = async () => {
    if (busy) return;
    if (!name) return setError(kind === 'borrowed' ? 'Who did you borrow from?' : 'Who did you lend to?');
    if (total <= 0) return setError('Enter the amount');
    if (accountId == null) return setError('Pick an account');
    setBusy(true);
    try {
      const plan = kind === 'borrowed' ? draftPlan(draft) : {};
      const { debtId } = await recordDebt(db, {
        person: name, kind, amount_paise: total, account_id: accountId, plan,
        first_due: kind === 'borrowed' ? draftFirstDue(draft, baseFirstDue, now) : null, note,
      });
      showUndo(
        kind === 'borrowed' ? `Borrowed ${formatINR(total)} from ${name}` : `Lent ${formatINR(total)} to ${name}`,
        async () => {
          await undoDebt(db, debtId);
        },
      );
      router.replace({ pathname: '/people/[id]', params: { id: String(debtId) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useScreenTitle(kind === 'borrowed' ? 'I borrowed money' : 'I lent money');
  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.chips}>
        <Chip label="I borrowed" icon="hand-coin-outline" selected={kind === 'borrowed'} onPress={() => setKind('borrowed')} />
        <Chip label="I lent" icon="hand-coin-outline" selected={kind === 'lent'} onPress={() => setKind('lent')} />
      </View>

      <SectionTitle>{kind === 'borrowed' ? 'From whom?' : 'To whom?'}</SectionTitle>
      <TextInput
        value={person}
        onChangeText={(t) => {
          setPerson(t);
          setError(null);
        }}
        placeholder="Name, e.g. Rahul"
        placeholderTextColor={p.textMuted}
        maxLength={40}
        autoCapitalize="words"
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      {people.length > 0 && (
        <View style={styles.chips}>
          {people.map((n) => (
            <Chip key={n} label={n} selected={name.toLowerCase() === n.toLowerCase()} onPress={() => setPerson(n)} />
          ))}
        </View>
      )}

      <SectionTitle>How much?</SectionTitle>
      <MoneyField value={amount} onChange={(v) => { setAmount(v); setError(null); }} />

      <SectionTitle>{kind === 'borrowed' ? 'It came into' : 'It went from'}</SectionTitle>
      <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />

      {kind === 'borrowed' && (
        <>
          <SectionTitle>How will you pay it back?</SectionTitle>
          <PlanEditor total={total} draft={draft} onChange={setDraft} baseFirstDue={baseFirstDue} nowMs={now} person={name} />
        </>
      )}
      {kind === 'lent' && (
        <Text style={{ color: p.textMuted }}>
          This isn&apos;t spending — Hisaab remembers that {name || 'they'} owe{name ? 's' : ''} you, and you can mark it
          paid back bit by bit.
        </Text>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional, e.g. for the laptop)"
        placeholderTextColor={p.textMuted}
        maxLength={120}
        style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
      />
      {error && <Text style={{ color: p.text, fontWeight: '600' }}>{error}</Text>}
      <Button
        label={total > 0 ? `${kind === 'borrowed' ? 'Save — borrowed' : 'Save — lent'} ${formatINR(total)}` : 'Save'}
        icon="check"
        onPress={onSave}
        disabled={busy}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
