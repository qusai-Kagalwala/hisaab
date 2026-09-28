import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BAND_LABEL, getIdeas, groupByBand, offlineIdeas, type Idea, type Mood } from '../../ai/ideas';
import { usePalette } from '../../components/theme';
import { Button, Card, Chip, MoneyField, SectionTitle } from '../../components/ui';
import { inputToPaise, paiseToInput } from '../../engine/money';
import { useAiStore } from '../../store/aiStore';
import { useLedgerStore } from '../../store/ledgerStore';

const MOODS: { id: Mood; label: string }[] = [
  { id: 'outdoor', label: '🌳 Outdoor' },
  { id: 'food', label: '🍜 Food' },
  { id: 'chill', label: '🛋️ Chill' },
  { id: 'social', label: '🎉 Social' },
];

/** "What can I do under ₹X?" — ballpark ideas, never bookings. */
export function IdeasScreen() {
  const p = usePalette();
  const buckets = useLedgerStore((s) => s.picture.buckets);
  const safe = useLedgerStore((s) => s.safe);
  const ai = useAiStore();
  // Default amount: Entertainment-ish bucket left, else today's safe to spend.
  const fun = buckets.find((b) => /entertain|fun/i.test(b.name) && b.remaining_paise > 0);
  const start = Math.floor((fun?.remaining_paise ?? safe.per_day_paise) / 100) * 100;
  const [input, setInput] = useState(start > 0 ? paiseToInput(start) : '500');
  const [mood, setMood] = useState<Mood | null>(null);
  const [result, setResult] = useState<{ ideas: Idea[]; source: 'ai' | 'offline'; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const budgetRupees = Math.floor(inputToPaise(input) / 100);

  const onFind = async () => {
    if (budgetRupees <= 0) return;
    setBusy(true);
    try {
      setResult(await getIdeas(budgetRupees, ai.city, mood, await ai.config()));
    } finally {
      setBusy(false);
    }
  };

  const ideas = result?.ideas ?? offlineIdeas(budgetRupees, mood);
  const groups = groupByBand(ideas, budgetRupees);

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>What can I do under…</SectionTitle>
      <MoneyField value={input} onChange={(v) => { setInput(v); setResult(null); }} />
      {fun && <Text style={{ color: p.textMuted, fontSize: 13 }}>Started from what&apos;s left in {fun.name}.</Text>}
      <View style={styles.chips}>
        {MOODS.map((m) => (
          <Chip key={m.id} label={m.label} selected={mood === m.id} onPress={() => { setMood(mood === m.id ? null : m.id); setResult(null); }} />
        ))}
      </View>
      <Button
        label={busy ? 'Looking…' : ai.enabled && ai.hasKey ? `Find ideas${ai.city ? ` in ${ai.city}` : ''}` : 'Show ideas'}
        onPress={onFind}
        disabled={busy || budgetRupees <= 0}
      />
      {result?.note && <Text style={{ color: p.textMuted }}>{result.note}</Text>}
      {!ai.enabled && (
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          Showing built-in ideas. Turn on AI in Settings for fresh ideas from your city.
        </Text>
      )}
      {groups.length === 0 && <Text style={{ color: p.textMuted }}>No ideas fit that yet — try a bigger amount or another mood.</Text>}
      {groups.map((g) => (
        <View key={g.band} style={{ gap: 8 }}>
          <SectionTitle>{BAND_LABEL[g.band]}</SectionTitle>
          {g.ideas.map((i) => (
            <Card key={`${i.title}-${i.price_rupees}`}>
              <View style={styles.between}>
                <Text style={{ color: p.text, fontWeight: '600', flex: 1 }}>{i.title}</Text>
                <Text style={{ color: p.text }}>{i.price_rupees === 0 ? 'Free' : `~₹${i.price_rupees}`}</Text>
              </View>
              <Text style={{ color: p.textMuted, fontSize: 13 }}>{i.why}</Text>
            </Card>
          ))}
        </View>
      ))}
      <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
        All prices are approximate. {result?.source === 'ai' ? 'Found with Google Search — check before you go.' : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
