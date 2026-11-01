import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, Text, View } from 'react-native';
import { useLedgerStore } from '../store/ledgerStore';
import { usePalette } from './theme';
import { Card, Chip } from './ui';

/** "Count my spending from: [All accounts] [SBI] [Cash]" — the spotlight account. */
export function SpotlightPicker() {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const spotlightId = useLedgerStore((s) => s.spotlightId);
  const setSpotlight = useLedgerStore((s) => s.setSpotlight);
  const chosen = accounts.find((a) => a.id === spotlightId);
  return (
    <Card>
      <Text style={{ color: p.text, fontWeight: '600' }}>Count my spending from</Text>
      <View style={styles.chips}>
        <Chip label="All accounts" icon="wallet-outline" selected={spotlightId == null} onPress={() => setSpotlight(db, null)} />
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            icon={a.type === 'cash' ? 'cash' : 'bank-outline'}
            selected={spotlightId === a.id}
            onPress={() => setSpotlight(db, a.id)}
          />
        ))}
      </View>
      <Text style={{ color: p.textMuted, fontSize: 13, lineHeight: 19 }}>
        {chosen
          ? `Safe to spend, bills, Insights and the widgets use ${chosen.name} only. Your other accounts are still kept up to date — move money into ${chosen.name} when you want it to count.`
          : 'Safe to spend, bills, Insights and the widgets add up all your accounts. Pick one account if that is the only one you spend from.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
