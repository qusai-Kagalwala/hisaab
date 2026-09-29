import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monthLabel, type MonthKey } from '../engine/calendar';
import { Icon } from './Icon';
import { MIN_TAP, usePalette } from './theme';

/** ‹ September 2026 › — browse the months that have entries. */
export function MonthSwitcher({
  months,
  value,
  onChange,
}: {
  months: readonly MonthKey[];
  value: MonthKey;
  onChange: (m: MonthKey) => void;
}) {
  const p = usePalette();
  const i = months.indexOf(value);
  const prev = i > 0 ? months[i - 1] : null;
  const next = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const arrow = (target: MonthKey | null, icon: 'chevron-left' | 'chevron-right', label: string) => (
    <Pressable
      onPress={() => target && onChange(target)}
      disabled={!target}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[styles.arrow, { opacity: target ? 1 : 0.3 }]}
    >
      <Icon name={icon} size={26} color={p.accent} />
    </Pressable>
  );
  return (
    <View style={[styles.wrap, { backgroundColor: p.surface, borderColor: p.border }]}>
      {arrow(prev, 'chevron-left', 'Previous month')}
      <Text style={[styles.label, { color: p.text }]} accessibilityRole="header">
        {monthLabel(value)}
      </Text>
      {arrow(next, 'chevron-right', 'Next month')}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  arrow: { width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
});
