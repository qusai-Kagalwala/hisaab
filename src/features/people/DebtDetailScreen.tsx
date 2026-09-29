import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AccountChips } from '../../components/AccountChips';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { Button, Card, MoneyField, ProgressBar, SectionTitle } from '../../components/ui';
import { firstDueDate, type DebtStatus } from '../../engine/debts';
import { formatINR, inputToPaise, paiseToInput, subtractPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { dayLabel, shortDate } from '../../utils/dates';
import { draftFirstDue, draftPlan, PlanEditor, type PlanDraft } from './PlanEditor';

export function DebtDetailScreen({ id }: { id: number }) {
  const debt = useLedgerStore((s) => s.debts.find((d) => d.id === id));
  const p = usePalette();
  if (!debt || debt.entry_ids.length === 0) {
    return (
      <View style={[styles.missing, { backgroundColor: p.background }]}>
        <Stack.Screen options={{ title: 'Borrow & lend' }} />
        <Text style={{ color: p.textMuted }}>This record is no longer here.</Text>
      </View>
    );
  }
  return <Detail debt={debt} />;
}

/** What to suggest paying now: what's due, else the next instalment, else everything left. */
function suggestedPayment(debt: DebtStatus) {
  if (debt.due_now_paise > 0) return debt.due_now_paise;
  if (debt.next) return Math.min(subtractPaise(debt.next.amount_paise, debt.next.paid_paise), debt.outstanding_paise);
  return debt.outstanding_paise;
}

function Detail({ debt }: { debt: DebtStatus }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const transactions = useLedgerStore((s) => s.transactions);
  const settleDebt = useLedgerStore((s) => s.settleDebt);
  const changeDebtPlan = useLedgerStore((s) => s.changeDebtPlan);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const showUndo = useUndoStore((s) => s.show);

  const borrowed = debt.kind === 'borrowed';
  const [now] = useState(() => Date.now());
  const [amount, setAmount] = useState(debt.outstanding_paise > 0 ? paiseToInput(suggestedPayment(debt)) : '');
  const [accountId, setAccountId] = useState<number | null>(lastAccountId);
  const [editingPlan, setEditingPlan] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>({
    mode: debt.per_month_paise != null ? 'amount' : debt.months != null ? 'months' : 'none',
    months: debt.months ?? 3,
    perMonth: debt.per_month_paise != null ? paiseToInput(debt.per_month_paise) : '',
    day: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = useMemo(
    () => debt.entry_ids.map((eid) => transactions.find((t) => t.id === eid)).filter((t) => t != null).reverse(),
    [debt.entry_ids, transactions],
  );
  const paise = inputToPaise(amount);
  const baseFirstDue = debt.first_due ?? firstDueDate(now);

  const onPay = async () => {
    if (busy || accountId == null) return;
    if (paise <= 0) return setError('Enter an amount');
    if (paise > debt.outstanding_paise) return setError(`Only ${formatINR(debt.outstanding_paise)} is left`);
    setBusy(true);
    try {
      const txId = await settleDebt(db, debt, paise, accountId);
      showUndo(borrowed ? `Repaid ${formatINR(paise)} to ${debt.person}` : `${debt.person} paid back ${formatINR(paise)}`, async () => {
        await undoNew(db, txId);
      });
      const after = useLedgerStore.getState().debts.find((d) => d.id === debt.id);
      setAmount(after && after.outstanding_paise > 0 ? paiseToInput(suggestedPayment(after)) : '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSavePlan = async () => {
    try {
      await changeDebtPlan(db, debt, draftPlan(draft), draftFirstDue(draft, baseFirstDue, now));
      setEditingPlan(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const headline = debt.settled
    ? borrowed ? `All repaid to ${debt.person}` : `${debt.person} paid it all back`
    : borrowed ? `You owe ${debt.person}` : `${debt.person} owes you`;

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: debt.person }} />
      <Card>
        <Text style={{ color: p.textMuted }}>{headline}</Text>
        {!debt.settled && <Text style={[styles.big, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatINR(debt.outstanding_paise)}</Text>}
        <ProgressBar fraction={debt.principal_paise > 0 ? debt.settled_paise / debt.principal_paise : 0} />
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          {formatINR(debt.settled_paise)} of {formatINR(debt.principal_paise)} {borrowed ? 'repaid' : 'back'} · no interest
        </Text>
        {borrowed && debt.due_now_paise > 0 && (
          <View style={[styles.due, { backgroundColor: p.accentSoft }]}>
            <Icon name="bell-ring-outline" size={18} color={p.accent} />
            <Text style={{ color: p.accent, fontWeight: '600', flex: 1 }}>
              {formatINR(debt.due_now_paise)} is due now
            </Text>
          </View>
        )}
      </Card>

      {!debt.settled && (
        <>
          <SectionTitle>{borrowed ? 'Record a repayment' : 'Record money you got back'}</SectionTitle>
          <MoneyField value={amount} onChange={(v) => { setAmount(v); setError(null); }} />
          <Text style={{ color: p.textMuted, fontSize: 13 }}>{borrowed ? 'Paid from' : 'Came into'}</Text>
          <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
          {error && <Text style={{ color: p.text, fontWeight: '600' }}>{error}</Text>}
          <Button
            label={paise > 0 ? (borrowed ? `Paid ${formatINR(paise)}` : `Got ${formatINR(paise)} back`) : borrowed ? 'Paid' : 'Got it back'}
            icon="check"
            onPress={onPay}
            disabled={busy || paise <= 0}
          />
          {paise !== debt.outstanding_paise && (
            <Pressable onPress={() => setAmount(paiseToInput(debt.outstanding_paise))} accessibilityRole="button" style={styles.link}>
              <Text style={{ color: p.accent, fontWeight: '600' }}>
                {borrowed ? 'Paying it all off?' : 'Got all of it?'} Use {formatINR(debt.outstanding_paise)}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {borrowed && (
        <>
          <SectionTitle>Repayment plan</SectionTitle>
          {editingPlan ? (
            <Card>
              <PlanEditor total={debt.principal_paise} draft={draft} onChange={setDraft} baseFirstDue={baseFirstDue} nowMs={now} person={debt.person} />
              <View style={styles.row}>
                <Button label="Save plan" compact onPress={onSavePlan} style={styles.flex} />
                <Button label="Cancel" variant="plain" compact onPress={() => setEditingPlan(false)} style={styles.flex} />
              </View>
            </Card>
          ) : debt.schedule.length === 0 ? (
            <Card>
              <Text style={{ color: p.textMuted }}>No fixed plan. Add one to have each month&apos;s payment kept aside.</Text>
              <Button label="Add a plan" variant="secondary" compact onPress={() => { setDraft({ ...draft, mode: 'months' }); setEditingPlan(true); }} />
            </Card>
          ) : (
            <Card>
              {debt.schedule.map((s) => (
                <View key={s.n} style={styles.line}>
                  <Icon
                    name={s.status === 'paid' ? 'check-circle' : s.status === 'due' ? 'bell-ring-outline' : 'circle-outline'}
                    size={18}
                    color={s.status === 'paid' || s.status === 'due' ? p.accent : p.textMuted}
                  />
                  <Text style={{ color: p.text, flex: 1 }}>
                    {shortDate(s.due)}
                    {s.status === 'part' || (s.status === 'due' && s.paid_paise > 0) ? ` · ${formatINR(s.paid_paise)} paid` : ''}
                  </Text>
                  <Text style={[styles.amount, { color: s.status === 'paid' ? p.textMuted : p.text }]}>{formatINR(s.amount_paise)}</Text>
                </View>
              ))}
              {!debt.settled && (
                <Button label="Change plan" variant="secondary" compact onPress={() => setEditingPlan(true)} />
              )}
            </Card>
          )}
        </>
      )}

      <SectionTitle>Entries</SectionTitle>
      {entries.map((t) => {
        const inward = t.direction === 'in';
        const label = borrowed ? (inward ? 'Borrowed' : 'Repaid') : inward ? 'Got back' : 'Lent';
        return (
          <Pressable
            key={t.id}
            onPress={() => router.push({ pathname: '/edit/[id]', params: { id: String(t.id) } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.entry, { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontWeight: '600' }}>{label}{t.note ? ` · ${t.note}` : ''}</Text>
              <Text style={{ color: p.textMuted, fontSize: 12 }}>
                {dayLabel(t.occurred_at)} · {accounts.find((a) => a.id === t.account_id)?.name ?? 'Account'}
              </Text>
            </View>
            <Text style={[styles.amount, { color: inward ? p.positive : p.text }]}>{formatINR(t.amount_paise, { signed: inward })}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  big: { fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  due: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10 },
  link: { alignSelf: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
});
