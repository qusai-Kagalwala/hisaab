import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { CategoryGrid } from '../../components/CategoryGrid';
import { usePalette } from '../../components/theme';
import { Card, MoneyField, SectionTitle } from '../../components/ui';
import { canIAfford } from '../../engine/afford';
import { inputToPaise } from '../../engine/money';
import { useLedgerStore } from '../../store/ledgerStore';

/** "Can I afford this?" — shows the impact; the user decides. */
export function AffordScreen() {
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const goals = useLedgerStore((s) => s.goals);
  const categories = useLedgerStore((s) => s.categories);
  const [now] = useState(() => Date.now());
  const [input, setInput] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const amount = inputToPaise(input);

  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === 'expense' && !c.hidden), [categories]);
  const result = useMemo(
    () => (amount > 0 ? canIAfford({ picture, amount_paise: amount, category_id: categoryId, goals, nowMs: now }) : null),
    [amount, categoryId, picture, goals, now],
  );

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>How much is it?</SectionTitle>
      <MoneyField value={input} onChange={setInput} autoFocus />
      {result && (
        <Card>
          <Text style={[styles.headline, { color: p.text }]}>{result.headline}</Text>
          {result.details.map((d) => (
            <Text key={d} style={{ color: p.textMuted, lineHeight: 20 }}>
              {d}
            </Text>
          ))}
        </Card>
      )}
      <SectionTitle>What is it? (optional)</SectionTitle>
      <Text style={{ color: p.textMuted, fontSize: 13 }}>Picking a category checks the right bucket.</Text>
      <CategoryGrid
        categories={expenseCategories}
        highlightedId={categoryId}
        onPress={(c) => setCategoryId((cur) => (cur === c.id ? null : c.id))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  headline: { fontSize: 18, fontWeight: '700' },
});
