import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Account } from '../engine/types';
import { usePalette } from './theme';

interface Props {
  accounts: Account[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function AccountChips({ accounts, selectedId, onSelect }: Props) {
  const p = usePalette();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
      {accounts.map((a) => {
        const selected = a.id === selectedId;
        return (
          <Pressable
            key={a.id}
            onPress={() => onSelect(a.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              { backgroundColor: selected ? p.accent : p.surface, borderColor: selected ? p.accent : p.border },
            ]}
          >
            <Text style={{ color: selected ? p.accentText : p.text, fontWeight: selected ? '600' : '400' }}>
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
});
