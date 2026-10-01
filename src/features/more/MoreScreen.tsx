import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { MIN_TAP, usePalette } from '../../components/theme';
import { SectionTitle } from '../../components/ui';
import type { FeatureId } from '../../engine/features';
import { useLedgerStore } from '../../store/ledgerStore';

interface Item {
  label: string;
  hint: string;
  icon: IconName;
  href: Href;
  /** Shown only when this feature is on. */
  feature?: FeatureId;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Money',
    items: [
      { label: 'Borrow & lend', hint: 'Who owes whom, repayment plans', icon: 'hand-coin-outline', href: '/people', feature: 'people' },
      { label: 'Move between accounts', hint: 'Bank → Cash, and back', icon: 'swap-horizontal', href: '/transfer' },
      { label: 'Accounts', hint: 'Balances, add or remove an account', icon: 'wallet-outline', href: '/accounts' },
      { label: 'Bills & income', hint: 'Rent, salary, recharges', icon: 'calendar-sync', href: '/recurring', feature: 'bills' },
    ],
  },
  {
    title: 'Plan',
    items: [
      { label: 'Buckets', hint: 'Plan your month (optional)', icon: 'bucket-outline', href: '/buckets', feature: 'buckets' },
      { label: 'Goals', hint: 'Save up for something', icon: 'flag-checkered', href: '/goals', feature: 'goals' },
      { label: 'Can I afford?', hint: 'Check before you buy', icon: 'scale', href: '/afford' },
    ],
  },
  {
    title: 'Help',
    items: [
      { label: 'Ask Hisaab', hint: 'Questions about your money', icon: 'message-text-outline', href: '/chat' },
      { label: 'Ideas under ₹X', hint: 'Things to do on a budget', icon: 'lightbulb-on-outline', href: '/ideas' },
    ],
  },
  {
    title: 'App',
    items: [
      { label: 'Import entries', hint: 'Paste text or pick a CSV (optional)', icon: 'tray-arrow-down', href: '/import' },
      { label: 'Settings & backup', hint: 'Theme, backup, spreadsheet, AI', icon: 'cog-outline', href: '/settings' },
      { label: 'How Hisaab works', hint: 'A 2-minute guide', icon: 'information-outline', href: '/about' },
    ],
  },
];

export function MoreScreen() {
  const p = usePalette();
  const features = useLedgerStore((s) => s.features);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || features[i.feature]) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <SectionTitle>{g.title}</SectionTitle>
          <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
            {g.items.map((item, i) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.href)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border },
                  pressed && { backgroundColor: p.surfacePressed },
                ]}
              >
                <View style={[styles.badge, { backgroundColor: p.accentSoft }]}>
                  <Icon name={item.icon} size={20} color={p.accent} />
                </View>
                <View style={styles.text}>
                  <Text style={[styles.label, { color: p.text }]}>{item.label}</Text>
                  <Text style={{ color: p.textMuted, fontSize: 12 }}>{item.hint}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={p.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 4 },
  group: { gap: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TAP + 12, paddingHorizontal: 14 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600' },
});
