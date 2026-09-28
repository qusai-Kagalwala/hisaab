import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../engine/types';
import { MIN_TAP, usePalette } from './theme';

interface Props {
  categories: Category[];
  /** Highlighted category (the guess on capture, the current one on edit). */
  highlightedId: number | null;
  onPress: (category: Category) => void;
  columns?: number;
}

export function CategoryGrid({ categories, highlightedId, onPress, columns = 4 }: Props) {
  const p = usePalette();
  return (
    <View style={styles.grid}>
      {categories.map((c) => {
        const highlighted = c.id === highlightedId;
        return (
          <Pressable
            key={c.id}
            onPress={() => onPress(c)}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            accessibilityState={{ selected: highlighted }}
            style={({ pressed }) => [
              styles.cell,
              { width: `${100 / columns - 2}%` },
              {
                backgroundColor: highlighted ? p.accentSoft : pressed ? p.surfacePressed : p.surface,
                borderColor: highlighted ? p.accent : p.border,
              },
            ]}
          >
            <Text style={styles.icon}>{c.icon}</Text>
            <Text numberOfLines={1} style={[styles.label, { color: p.text }]}>
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  cell: {
    minHeight: MIN_TAP + 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  icon: { fontSize: 22 },
  label: { fontSize: 11, marginTop: 2 },
});
