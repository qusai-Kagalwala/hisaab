import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { normalizeAmountText } from '../engine/money';
import { MIN_TAP, usePalette } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'plain';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, compact, style }: ButtonProps) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.accent : variant === 'secondary' ? p.accentSoft : 'transparent';
  const fg = variant === 'primary' ? p.accentText : variant === 'secondary' ? p.accent : p.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Fill bar for "₹2,550 of ₹3,000 left". Calm colours only, even when over. */
export function ProgressBar({ fraction, muted }: { fraction: number; muted?: boolean }) {
  const p = usePalette();
  const width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: p.surfacePressed }]}>
      <View style={[styles.fill, { width, backgroundColor: muted ? p.textMuted : p.accent }]} />
    </View>
  );
}

/** A ₹ text field that only ever holds canonical keypad input. */
export function MoneyField({
  value,
  onChange,
  placeholder = '0',
  autoFocus,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  return (
    <View style={[styles.moneyField, { borderColor: p.border, backgroundColor: p.surface }, style]}>
      <Text style={[styles.rupee, { color: p.textMuted }]}>₹</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(normalizeAmountText(t))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={p.textMuted}
        autoFocus={autoFocus}
        style={[styles.moneyInput, { color: p.text }]}
      />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.section, { color: p.text }]}>{children}</Text>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? p.accent : p.border, backgroundColor: selected ? p.accentSoft : p.surface }]}
    >
      <Text style={{ color: selected ? p.accent : p.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  button: { minHeight: MIN_TAP, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonCompact: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextCompact: { fontSize: 14 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  moneyField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP },
  rupee: { fontSize: 18, marginRight: 4 },
  moneyInput: { flex: 1, fontSize: 18, paddingVertical: 8 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
});
