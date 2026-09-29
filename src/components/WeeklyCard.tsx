import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { weeklyFacts, weeklySummary, weekKey } from '../ai/weekly';
import { getSetting, setSetting } from '../db/queries';
import { useAiStore } from '../store/aiStore';
import { useLedgerStore } from '../store/ledgerStore';
import { usePalette } from './theme';
import { Card } from './ui';

/** Opt-in weekly 3-line summary, made once per week and kept. */
export function WeeklyCard() {
  const db = useSQLiteContext();
  const p = usePalette();
  const enabled = useAiStore((s) => s.weekly);
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const excluded = useLedgerStore((s) => s.recurringTxIds);
  const [summary, setSummary] = useState<{ text: string; source: 'ai' | 'offline' } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const now = Date.now();
      const key = `weekly:${weekKey(now)}`;
      const cached = await getSetting(db, key);
      if (cached) {
        if (!cancelled) setSummary(JSON.parse(cached));
        return;
      }
      const facts = weeklyFacts(transactions, categories, now, excluded);
      if (facts.last7 === 0 && facts.prev7 === 0) return;
      const made = await weeklySummary(facts, await useAiStore.getState().config());
      await setSetting(db, key, JSON.stringify(made));
      if (!cancelled) setSummary(made);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Once per visit is enough; the result is cached for the week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, db]);

  if (!enabled || !summary) return null;
  return (
    <Card>
      <Text style={{ color: p.textMuted, fontSize: 12 }}>{summary.source === 'ai' ? 'Your week · AI' : 'Your week'}</Text>
      <Text style={{ color: p.text, lineHeight: 21 }}>{summary.text}</Text>
    </Card>
  );
}
