/** Opt-in weekly 3-line summary: engine facts, optionally phrased by AI. */
import { addDays, startOfDayMs } from '../engine/calendar';
import { everydayExpenses } from '../engine/insights';
import { addPaise, formatINR } from '../engine/money';
import type { Category, EffectiveTransaction } from '../engine/types';
import type { AiConfig } from './assistant';
import { aiReady } from './assistant';
import { chainFor, runWithFallback } from './fallback';
import { generate, type FetchLike } from './gemini';
import { mentionsProducts, numbersAreGrounded } from './guard';
import { weeklySystem } from './prompts';

/** Monday (local) of the week containing `ms`, as a key like 2026-09-28. */
export function weekKey(ms: number): string {
  const day = new Date(ms).getDay(); // 0 Sun
  const monday = addDays(startOfDayMs(ms), -((day + 6) % 7));
  const d = new Date(monday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface WeeklyFacts {
  last7: number;
  prev7: number;
  topCategory: string | null;
  topPaise: number;
  facts: string;
  offline: string;
}

export function weeklyFacts(
  transactions: readonly EffectiveTransaction[],
  categories: readonly Pick<Category, 'id' | 'name'>[],
  nowMs: number,
  excluded: ReadonlySet<number> = new Set(),
): WeeklyFacts {
  const today = startOfDayMs(nowMs);
  const from = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const exp = everydayExpenses(transactions, excluded);
  const sum = (a: number, b: number) => addPaise(...exp.filter((t) => t.occurred_at >= a && t.occurred_at < b).map((t) => t.amount_paise));
  const tomorrow = addDays(today, 1);
  const last7 = sum(from, tomorrow);
  const prev7 = sum(prevFrom, from);
  const byCat = new Map<number | null, number>();
  for (const t of exp) if (t.occurred_at >= from && t.occurred_at < tomorrow) byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) + t.amount_paise);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const topName = top ? categories.find((c) => c.id === top[0])?.name ?? 'Other' : null;
  const fmt = (p: number) => formatINR(p, { paise: 'never' });

  const facts = [
    `Spent in the last 7 days: ${fmt(last7)}`,
    `Spent in the 7 days before that: ${fmt(prev7)}`,
    topName ? `Biggest category this week: ${topName} (${fmt(top![1])})` : 'No spending logged this week.',
  ].join('\n');
  const trend = prev7 === 0 ? '' : last7 > prev7 ? 'a bit more than' : last7 < prev7 ? 'less than' : 'the same as';
  const offline = [
    `This week you spent ${fmt(last7)}${trend ? ` — ${trend} the week before (${fmt(prev7)})` : ''}.`,
    topName ? `Most of it went to ${topName} (${fmt(top![1])}).` : 'Nothing logged this week yet.',
    last7 > prev7 && prev7 > 0 ? `A small cap on ${topName ?? 'spending'} could help next week.` : 'Nice — keep the same rhythm next week.',
  ].join('\n');
  return { last7, prev7, topCategory: topName, topPaise: top?.[1] ?? 0, facts, offline };
}

export async function weeklySummary(
  w: WeeklyFacts,
  config: AiConfig,
  fetchImpl?: FetchLike,
): Promise<{ text: string; source: 'ai' | 'offline' }> {
  if (!aiReady(config)) return { text: w.offline, source: 'offline' };
  try {
    const { result } = await runWithFallback(chainFor('strong', config.models), (m) =>
      generate(config.apiKey!, { model: m, system: weeklySystem(), prompt: `FACTS:\n${w.facts}`, maxOutputTokens: 200 }, fetchImpl),
    );
    if (!numbersAreGrounded(result, w.facts) || mentionsProducts(result)) return { text: w.offline, source: 'offline' };
    return { text: result.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n'), source: 'ai' };
  } catch {
    return { text: w.offline, source: 'offline' };
  }
}
