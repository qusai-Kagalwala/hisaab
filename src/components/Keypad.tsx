import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { KeypadKey } from '../engine/money';
import { Icon } from './Icon';
import { MIN_TAP, usePalette } from './theme';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];

interface Props {
  onKey: (key: KeypadKey) => void;
  /** Long-press on backspace clears everything. */
  onClear: () => void;
}

export function Keypad({ onKey, onClear }: Props) {
  const p = usePalette();
  return (
    <View style={styles.grid}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => onKey(key)}
              onLongPress={key === 'back' ? onClear : undefined}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? 'Backspace, long press to clear' : key === '.' ? 'Decimal point' : key}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border },
              ]}
            >
              {key === 'back' ? (
                <Icon name="backspace-outline" size={26} color={p.text} />
              ) : (
                <Text maxFontSizeMultiplier={1.3} style={[styles.keyText, { color: p.text }]}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: {
    flex: 1,
    minHeight: MIN_TAP + 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 26, fontWeight: '500' },
});
