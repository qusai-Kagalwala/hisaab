import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { Button, Card, Chip, MoneyField } from '../../components/ui';
import { setSetting, SETTING_BUCKETS_OFF } from '../../db/queries';
import { BUCKET_TEMPLATES, type TemplateId } from '../../engine/buckets';
import { CATEGORY_ID } from '../../engine/defaults';
import { formatINR, inputToPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';

type Step = 'welcome' | 'balances' | 'income' | 'bills' | 'buckets';
const ORDER: Step[] = ['welcome', 'balances', 'income', 'bills', 'buckets'];

const INCOME_KINDS: { id: string; label: string; icon: IconName; category: number }[] = [
  { id: 'salary', label: 'Salary', icon: 'briefcase', category: CATEGORY_ID.salary },
  { id: 'pocket', label: 'Pocket money', icon: 'wallet', category: CATEGORY_ID.pocketMoney },
  { id: 'stipend', label: 'Stipend', icon: 'school', category: CATEGORY_ID.salary },
];
const BILL_KINDS: { label: string; icon: IconName; category: number }[] = [
  { label: 'Rent', icon: 'home-city', category: CATEGORY_ID.rent },
  { label: 'Phone recharge', icon: 'cellphone', category: CATEGORY_ID.bills },
  { label: 'Internet', icon: 'wifi', category: CATEGORY_ID.bills },
  { label: 'Fees', icon: 'school', category: CATEGORY_ID.education },
  { label: 'Other bill', icon: 'receipt', category: CATEGORY_ID.bills },
];

function DayStepper({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={{ color: p.text }}>On day</Text>
      <Button label="−" variant="secondary" compact onPress={() => onChange(Math.max(1, value - 1))} />
      <Text style={[styles.day, { color: p.text }]}>{value}</Text>
      <Button label="+" variant="secondary" compact onPress={() => onChange(Math.min(31, value + 1))} />
      <Text style={{ color: p.textMuted }}>of the month</Text>
    </View>
  );
}

/** First launch only: max 3 questions (+ balances), every step skippable. */
export function OnboardingScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const adjustBalance = useLedgerStore((s) => s.adjustBalance);
  const addRecurring = useLedgerStore((s) => s.addRecurring);
  const setupBuckets = useLedgerStore((s) => s.setupBuckets);
  const finish = useLedgerStore((s) => s.finishOnboarding);
  const load = useLedgerStore((s) => s.load);

  const [step, setStep] = useState<Step>('welcome');
  const [cash, setCash] = useState('');
  const [bank, setBank] = useState('');
  const [incomeKind, setIncomeKind] = useState<string | null>(null);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDay, setIncomeDay] = useState(1);
  const [incomeAccount, setIncomeAccount] = useState<number | null>(null);
  const [bills, setBills] = useState<{ label: string; category: number; amount: string; day: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const cashAccount = accounts.find((a) => a.type === 'cash');
  const bankAccount = accounts.find((a) => a.type === 'upi_bank');
  const next = () => setStep(ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)]);

  const done = async () => {
    await finish(db);
    await load(db);
    router.replace('/');
  };

  const saveBalances = async () => {
    setBusy(true);
    try {
      if (cashAccount && cash) await adjustBalance(db, cashAccount.id, inputToPaise(cash));
      if (bankAccount && bank) await adjustBalance(db, bankAccount.id, inputToPaise(bank));
      next();
    } finally {
      setBusy(false);
    }
  };

  const saveIncome = async () => {
    const kind = INCOME_KINDS.find((k) => k.id === incomeKind);
    const amount = inputToPaise(incomeAmount);
    if (kind && amount > 0) {
      setBusy(true);
      try {
        await addRecurring(db, {
          type: 'income', name: kind.label, amount_paise: amount,
          account_id: incomeAccount ?? bankAccount?.id ?? accounts[0].id, category_id: kind.category,
          rule: 'monthly', anchor_day: incomeDay,
        });
      } finally {
        setBusy(false);
      }
    }
    next();
  };

  const saveBills = async () => {
    setBusy(true);
    try {
      for (const b of bills) {
        const amount = inputToPaise(b.amount);
        if (amount <= 0) continue;
        await addRecurring(db, {
          type: 'expense', name: b.label, amount_paise: amount,
          account_id: bankAccount?.id ?? accounts[0].id, category_id: b.category, rule: 'monthly', anchor_day: b.day,
        });
      }
      next();
    } finally {
      setBusy(false);
    }
  };

  const pickBuckets = async (id: TemplateId | 'none') => {
    setBusy(true);
    try {
      if (id === 'none') await setSetting(db, SETTING_BUCKETS_OFF, '1');
      else await setupBuckets(db, id);
      await done();
    } finally {
      setBusy(false);
    }
  };

  const dots = (
    <View style={styles.dots}>
      {ORDER.slice(1).map((s) => (
        <View key={s} style={[styles.dot, { backgroundColor: ORDER.indexOf(s) <= ORDER.indexOf(step) ? p.accent : p.border }]} />
      ))}
    </View>
  );

  const header = (title: string, sub: string) => (
    <View style={{ gap: 6 }}>
      {dots}
      <Text style={[styles.title, { color: p.text }]}>{title}</Text>
      <Text style={{ color: p.textMuted, lineHeight: 20 }}>{sub}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: p.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View />
        {step !== 'welcome' && (
          <Pressable onPress={done} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: p.textMuted, fontSize: 15 }}>Skip setup</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'welcome' && (
          <View style={styles.welcome}>
            <View style={[styles.logo, { backgroundColor: p.accent }]}>
              <Text style={[styles.logoText, { color: p.accentText }]}>₹</Text>
            </View>
            <Text style={[styles.brand, { color: p.text }]}>Hisaab</Text>
            <Text style={{ color: p.textMuted, fontSize: 16 }}>Log it as fast as you pay it.</Text>
            <View style={styles.points}>
              {([
                ['lightning-bolt-outline', 'Log a spend in 3 taps'],
                ['calendar-today', 'Know what’s safe to spend today'],
                ['shield-lock-outline', 'Private: stays on your phone, no login'],
              ] as [IconName, string][]).map(([icon, text]) => (
                <View key={text} style={styles.point}>
                  <Icon name={icon} size={22} color={p.accent} />
                  <Text style={{ color: p.text, fontSize: 15 }}>{text}</Text>
                </View>
              ))}
            </View>
            <Button label="Set up in 1 minute" onPress={next} style={{ alignSelf: 'stretch' }} />
            <Button label="Skip — start logging" variant="plain" onPress={done} />
          </View>
        )}

        {step === 'balances' && (
          <>
            {header('What do you have right now?', 'So Hisaab can tell you what’s safe to spend. Rough is fine — you can change it any time.')}
            <Card>
              <Text style={{ color: p.text, fontWeight: '600' }}>{cashAccount?.name ?? 'Cash'} (wallet)</Text>
              <MoneyField value={cash} onChange={setCash} />
              <Text style={{ color: p.text, fontWeight: '600', marginTop: 6 }}>{bankAccount?.name ?? 'UPI / Bank'}</Text>
              <MoneyField value={bank} onChange={setBank} />
            </Card>
            <Button label="Next" onPress={saveBalances} disabled={busy} />
          </>
        )}

        {step === 'income' && (
          <>
            {header('How do you usually get money?', 'On the day it’s due, Hisaab asks “Expected ₹X — received?”. Nothing is added without your tap.')}
            <View style={styles.chips}>
              {INCOME_KINDS.map((k) => (
                <Chip key={k.id} label={k.label} icon={k.icon} selected={incomeKind === k.id} onPress={() => setIncomeKind(incomeKind === k.id ? null : k.id)} />
              ))}
            </View>
            {incomeKind && (
              <Card>
                <Text style={{ color: p.text, fontWeight: '600' }}>About how much each month?</Text>
                <MoneyField value={incomeAmount} onChange={setIncomeAmount} autoFocus />
                <DayStepper value={incomeDay} onChange={setIncomeDay} />
                <View style={styles.chips}>
                  {accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={(incomeAccount ?? bankAccount?.id) === a.id} onPress={() => setIncomeAccount(a.id)} />
                  ))}
                </View>
              </Card>
            )}
            <Button label={incomeKind ? 'Next' : 'It varies — skip'} onPress={saveIncome} disabled={busy} />
          </>
        )}

        {step === 'bills' && (
          <>
            {header('Any fixed payments each month?', 'Hisaab keeps this money aside so it isn’t counted as free to spend.')}
            <View style={styles.chips}>
              {BILL_KINDS.map((k) => (
                <Chip
                  key={k.label}
                  label={k.label}
                  icon={k.icon}
                  selected={bills.some((b) => b.label === k.label)}
                  onPress={() =>
                    setBills((cur) =>
                      cur.some((b) => b.label === k.label)
                        ? cur.filter((b) => b.label !== k.label)
                        : [...cur, { label: k.label, category: k.category, amount: '', day: 5 }],
                    )
                  }
                />
              ))}
            </View>
            {bills.map((b, i) => (
              <Card key={b.label}>
                <Text style={{ color: p.text, fontWeight: '600' }}>{b.label}</Text>
                <MoneyField value={b.amount} onChange={(v) => setBills((cur) => cur.map((x, k) => (k === i ? { ...x, amount: v } : x)))} />
                <DayStepper value={b.day} onChange={(d) => setBills((cur) => cur.map((x, k) => (k === i ? { ...x, day: d } : x)))} />
              </Card>
            ))}
            <Button label={bills.length ? 'Next' : 'None — skip'} onPress={saveBills} disabled={busy} />
          </>
        )}

        {step === 'buckets' && (
          <>
            {header('Plan your month with buckets?', 'Optional. Buckets split your free money into plans like Savings or Personal. Templates are a starting point, not advice.')}
            {BUCKET_TEMPLATES.map((t) => (
              <Pressable key={t.id} onPress={() => pickBuckets(t.id)} disabled={busy} accessibilityRole="button">
                {({ pressed }) => (
                  <Card style={pressed && { backgroundColor: p.surfacePressed }}>
                    <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>{t.label}</Text>
                    <Text style={{ color: p.textMuted }}>{t.description}</Text>
                    {t.id !== 'custom' && (
                      <Text style={{ color: p.text, fontSize: 13 }}>{t.buckets.map((b) => `${b.name} ${b.percent}%`).join(' · ')}</Text>
                    )}
                  </Card>
                )}
              </Pressable>
            ))}
            <Button label="No buckets for now" variant="secondary" onPress={() => pickBuckets('none')} disabled={busy} />
            <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
              {cash || bank ? `You entered ${formatINR(inputToPaise(cash) + inputToPaise(bank))} in total.` : ''}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, minHeight: 40 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  welcome: { alignItems: 'center', gap: 12, paddingTop: 24 },
  logo: { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 48, fontWeight: '800' },
  brand: { fontSize: 30, fontWeight: '800' },
  points: { alignSelf: 'stretch', gap: 14, marginVertical: 20 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  title: { fontSize: 22, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  day: { fontSize: 20, fontWeight: '700', minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
