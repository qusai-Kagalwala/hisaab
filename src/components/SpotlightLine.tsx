import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { formatINR } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { Icon } from './Icon';
import { usePalette } from './theme';

/** Under safe to spend: which account is counted, and what is left out. Tap → Settings. */
export function SpotlightLine() {
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const balances = useLedgerStore((s) => s.balances);
  const spotlightId = useLedgerStore((s) => s.spotlightId);
  const spotlight = accounts.find((a) => a.id === spotlightId);
  if (!spotlight) return null;
  const others = accounts
    .filter((a) => a.id !== spotlight.id)
    .map((a) => `${a.name} ${formatINR(balances.get(a.id) ?? 0, { paise: 'never' })}`);
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={`Counting ${spotlight.name} only. Change in Settings`}
      style={[styles.row, { borderColor: p.border }]}
    >
      <Icon name="target" size={16} color={p.accent} />
      <Text style={{ color: p.textMuted, fontSize: 13, flex: 1 }}>
        <Text style={{ color: p.text, fontWeight: '600' }}>Counting {spotlight.name} only</Text>
        {others.length > 0 ? ` · Not counted: ${others.join(' · ')}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch',
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
});
