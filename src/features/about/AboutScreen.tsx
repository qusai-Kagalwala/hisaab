import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { MadeBy } from '../../components/MadeBy';
import { usePalette } from '../../components/theme';
import { Button, Card } from '../../components/ui';

interface Section {
  id: string;
  icon: IconName;
  title: string;
  body: ReactNode;
}

function P({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.p, { color: p.text }]}>{children}</Text>;
}

function H({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.h, { color: p.textMuted }]}>{children}</Text>;
}

function Steps({ items }: { items: string[] }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View key={t} style={styles.step}>
          <View style={[styles.num, { backgroundColor: p.accentSoft }]}>
            <Text style={{ color: p.accent, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
          </View>
          <Text style={[styles.p, { color: p.text, flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Tip({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[styles.tip, { backgroundColor: p.accentSoft }]}>
      <Text style={{ color: p.text, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/** Built on render (not at import) so it can use the styles defined below. */
function sections(): Section[] {
  return [
    {
      id: 'start',
      icon: 'rocket-launch-outline',
      title: 'Start here (2 minutes)',
      body: (
        <Steps
          items={[
            'The bar at the bottom: Home, History, the big + (log a spend), Insights and More.',
            'More → Accounts → tap “Update” on Cash and on UPI / Bank, and type what you really have right now.',
            'More → Bills & income → add your salary or pocket money, and fixed bills like rent or recharge.',
            'Log spends as they happen: tap +, type the amount on the keypad, tap a category. Done.',
            'Optional: set up Buckets to plan your month, and Goals for things you’re saving up for.',
            'Optional: add a free AI key for friendlier chat answers (see “Using AI” below).',
          ]}
        />
      ),
    },
    {
      id: 'log',
      icon: 'lightning-bolt-outline',
      title: 'Logging a spend',
      body: (
        <>
          <P>Keypad: type 40 → tap Chai & Snacks. That’s it — 3 taps. The highlighted category is Hisaab’s guess for this time of day.</P>
          <P>Typing: tap “Aa Type” and write like a message — “chai 20”, “auto 50 cash”, “2k rent”, “do sau sabzi”. Press Enter.</P>
          <P>Voice: in typing mode, tap the mic on your phone’s keyboard and just say it.</P>
          <P>Quick chips like “Chai ₹20” appear for things you log often — one tap saves. Long-press the big ₹ amount to repeat your last entry.</P>
          <Tip>Made a mistake? Tap Undo on the black bar (5 seconds), or fix it later in History. Hisaab never deletes your history — edits are saved as corrections.</Tip>
        </>
      ),
    },
    {
      id: 'safe',
      icon: 'calendar-today',
      title: '“Safe to spend today” explained',
      body: (
        <>
          <P>It answers one question: how much can I spend today and still be fine for the rest of the month?</P>
          <P>Money in your accounts{'\n'}− bills still due this month{'\n'}− repayments of borrowed money due this month{'\n'}− money in goals{'\n'}− money still planned in buckets (except Flexible){'\n'}= free money for the rest of the month</P>
          <P>Then: free money ÷ days left in the month (today included) = safe to spend today.</P>
          <Tip>Example: ₹29,520 free and 3 days left (28, 29, 30 Sep) → ₹9,840 a day. Spend less today and tomorrow’s number goes up. Tap “How is this worked out?” on Home to see your own maths.</Tip>
        </>
      ),
    },
    {
      id: 'bills',
      icon: 'calendar-sync',
      title: 'Salary and bills',
      body: (
        <>
          <P>Add them once in Bills & income (monthly or weekly). On the due day Home shows “Expected ₹X — received?” or “paid?”.</P>
          <P>Tap Confirm, Edit amount (if it was different) or Skip. Hisaab never adds these by itself, so your numbers stay true even if salary comes late.</P>
          <P>Bills still to pay this month are kept aside, so “safe to spend” doesn’t count them as free.</P>
        </>
      ),
    },
    {
      id: 'people',
      icon: 'hand-coin-outline',
      title: 'Moving money, borrowing and lending',
      body: (
        <>
          <P>Took cash from the ATM? More → Move between accounts (or the two-arrows button at the top of the + screen): Bank → Cash. It isn’t spending, so your totals don’t change.</P>
          <P>Borrowed from a friend? More → Borrow & lend → I borrowed. The money goes into your account, but it’s not income. Pick how many months (or how much per month) to pay it back — Hisaab shows the full breakdown, with no interest.</P>
          <P>Each month’s payment is kept aside like a bill, so safe to spend doesn’t count it. On the day, Home asks “₹X due to Rahul — paid?”. Nothing is ever paid by itself: you tap Paid. Paying extra? The rest of the plan adjusts.</P>
          <P>Lent someone money? “I lent” — it leaves your account without counting as spending, and you tick it off as they pay you back.</P>
        </>
      ),
    },
    {
      id: 'buckets',
      icon: 'bucket-outline',
      title: 'Buckets (optional)',
      body: (
        <>
          <P>Buckets are a plan for money you haven’t spent yet — like envelopes: Savings, Personal, Entertainment, Flexible…</P>
          <P>Pick a template (Balanced, Student or Custom), then change any % or ₹. When you log a spend, it comes out of the bucket its category belongs to (anything else from Flexible).</P>
          <P>Went over? Hisaab asks “Cover it from which bucket?”. At the start of a new month you choose what happens to leftovers: keep, move to Savings or to Flexible.</P>
          <Tip>Don’t want buckets? Buckets → “Turn off buckets”. Everything else keeps working.</Tip>
        </>
      ),
    },
    {
      id: 'goals',
      icon: 'bullseye-arrow',
      title: 'Goals',
      body: (
        <>
          <P>Add a goal like “Laptop ₹80,000”. Put money in whenever you can — it comes from your Savings bucket first, then from free money, and it’s kept aside.</P>
          <P>Hisaab shows when you’ll get there at your recent pace, and the “What if I save more?” slider shows how much sooner.</P>
          <P>Bought it? Tap “Done — use the money” and log the purchase as usual.</P>
        </>
      ),
    },
    {
      id: 'insights',
      icon: 'chart-box-outline',
      title: 'Insights, Ideas and “Can I afford it?”',
      body: (
        <>
          <P>Insights: pick any month with ‹ ›. See money in vs out, how much you kept (% saved), your biggest days, average per day, where the money went, and 6 months of in vs out. Tap a row to see its entries.</P>
          <P>History: search anything (“swiggy”, “Rahul”), or filter by Spent, Money in, Moves, Borrow & lend, or an account. A small repeat mark means it came from a bill or salary reminder.</P>
          <P>Can I afford…?: type a price — see which bucket it comes from, and how today’s safe-to-spend changes. You decide.</P>
          <P>Ideas: things to do under an amount (free walks to café outings), grouped by price. All prices are approximate.</P>
        </>
      ),
    },
    {
      id: 'ai',
      icon: 'robot-outline',
      title: 'Using AI — where to add the key',
      body: (
        <>
          <P>AI is optional. Without it, Ask Hisaab still answers from your numbers. With it, answers are friendlier and Ideas can search your city.</P>
          <H>Get a free Gemini key</H>
          <Steps
            items={[
              'On your phone or laptop, open aistudio.google.com and sign in with your Google account.',
              'Tap “Get API key” → “Create API key”, then copy it (a long code starting with “AIza…”).',
              'In Hisaab: More → Settings & backup → AI → paste the key in the box → “Check & save key”.',
              'Hisaab checks it with Google and picks models for you. “Use AI” turns on.',
            ]}
          />
          <Tip>Your key is stored encrypted on this phone only and is never in backups. With AI on, only the totals needed for a question are sent to Google — never your entry list, notes or account names. Any AI answer with numbers Hisaab didn’t calculate is thrown away.</Tip>
        </>
      ),
    },
    {
      id: 'backup',
      icon: 'database-arrow-down-outline',
      title: 'Backup and new phone',
      body: (
        <>
          <P>Everything lives only on this phone — there’s no account or cloud. Settings & backup → Export backup saves a file you can keep in Drive, email or WhatsApp.</P>
          <P>On a new phone (or the installed app): Settings & backup → Restore from file. You can undo a restore for 5 seconds.</P>
          <P>Spreadsheet: Settings → Download CSV gives all entries for Excel or Google Sheets. More → Import entries brings entries in from pasted text or a CSV (the old budget.io export works) — you review every row first.</P>
          <Tip>Uninstalling the app deletes its data. Export a backup now and then.</Tip>
        </>
      ),
    },
    {
      id: 'privacy',
      icon: 'shield-lock-outline',
      title: 'Privacy',
      body: (
        <P>No login, no server, no bank or SMS access, no ads, no tracking. Hisaab only knows what you type or choose to import. AI is off unless you add your own key.</P>
      ),
    },
  ];
}

export function AboutScreen({ initial }: { initial?: string }) {
  const p = usePalette();
  const [open, setOpen] = useState<string | null>(initial ?? 'start');
  const scroll = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  return (
    <ScrollView ref={scroll} style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Logo size={64} />
        <Text style={[styles.title, { color: p.text }]}>Hisaab</Text>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>Log it as fast as you pay it.</Text>
        <Text style={[styles.p, { color: p.textMuted, textAlign: 'center' }]}>
          A private money diary for India. Know what you spent, what’s left, and what you can do with it.
        </Text>
      </View>

      {sections().map((s) => {
        const isOpen = open === s.id;
        return (
          <View
            key={s.id}
            onLayout={(e) => {
              // Opened with a section (e.g. from Settings → AI help): jump to it once.
              if (s.id === initial && !scrolled.current) {
                scrolled.current = true;
                scroll.current?.scrollTo({ y: Math.max(e.nativeEvent.layout.y - 8, 0), animated: false });
              }
            }}
          >
          <Card style={styles.card}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : s.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={styles.sectionHead}
            >
              <View style={[styles.sectionIcon, { backgroundColor: p.accentSoft }]}>
                <Icon name={s.icon} size={20} color={p.accent} />
              </View>
              <Text style={[styles.sectionTitle, { color: p.text }]}>{s.title}</Text>
              <Text style={{ color: p.textMuted, fontSize: 18 }}>{isOpen ? '−' : '+'}</Text>
            </Pressable>
            {isOpen && <View style={styles.body}>{s.body}</View>}
          </Card>
          </View>
        );
      })}

      <View style={styles.links}>
        <Button label="Open Settings & backup" variant="secondary" compact onPress={() => router.push('/settings')} />
        <Button label="Start logging" compact onPress={() => router.dismissTo('/')} />
      </View>

      <MadeBy />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  header: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: '800' },
  card: { paddingVertical: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  sectionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  body: { gap: 10, paddingBottom: 10 },
  p: { fontSize: 14, lineHeight: 21 },
  h: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tip: { borderRadius: 12, padding: 12 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
});
