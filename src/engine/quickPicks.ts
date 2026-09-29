/** Quick-add chips and "repeat last", learned from what the user logs. */
import { ADJUSTMENT_CATEGORY } from './defaults';
import type { Paise } from './money';
import type { EffectiveTransaction } from './types';

export interface QuickPick {
  category_id: number;
  amount_paise: Paise;
  account_id: number;
  note: string | null;
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const QUICK_WINDOW_DAYS = 30;
export const QUICK_MIN_COUNT = 2;

function isUserEntry(t: EffectiveTransaction, excluded: ReadonlySet<number>): boolean {
  return !t.voided && t.category_id != null && t.category_id !== ADJUSTMENT_CATEGORY.id && !excluded.has(t.id);
}

/** Most frequent (category, amount) expense pairs in the last 30 days. */
export function quickPicks(
  transactions: readonly EffectiveTransaction[],
  nowMs: number,
  excluded: ReadonlySet<number> = new Set(),
  limit = 4,
): QuickPick[] {
  const since = nowMs - QUICK_WINDOW_DAYS * DAY_MS;
  const groups = new Map<string, QuickPick & { last: number }>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.occurred_at < since || !isUserEntry(t, excluded)) continue;
    const key = `${t.category_id}:${t.amount_paise}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (t.occurred_at > g.last) Object.assign(g, { last: t.occurred_at, account_id: t.account_id, note: t.note });
    } else {
      groups.set(key, {
        category_id: t.category_id!, amount_paise: t.amount_paise, account_id: t.account_id,
        note: t.note, count: 1, last: t.occurred_at,
      });
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= QUICK_MIN_COUNT)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map(({ last: _last, ...pick }) => pick);
}

/**
 * For the home-screen widget: frequent spends first, then the most recent
 * different spends to fill the row — so it's useful from the first entry.
 */
export function frequentThenRecent(
  transactions: readonly EffectiveTransaction[],
  nowMs: number,
  excluded: ReadonlySet<number> = new Set(),
  limit = 3,
): QuickPick[] {
  const picks = quickPicks(transactions, nowMs, excluded, limit);
  const seen = new Set(picks.map((p) => `${p.category_id}:${p.amount_paise}`));
  const since = nowMs - QUICK_WINDOW_DAYS * DAY_MS;
  const newest = [...transactions].sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
  for (const t of newest) {
    if (picks.length >= limit) break;
    if (t.type !== 'expense' || t.occurred_at < since || t.occurred_at > nowMs || !isUserEntry(t, excluded)) continue;
    const key = `${t.category_id}:${t.amount_paise}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push({ category_id: t.category_id!, amount_paise: t.amount_paise, account_id: t.account_id, note: t.note, count: 1 });
  }
  return picks;
}

/** The latest entry the user logged themselves (for long-press repeat). */
export function lastEntry(
  transactions: readonly EffectiveTransaction[],
  excluded: ReadonlySet<number> = new Set(),
): EffectiveTransaction | null {
  let best: EffectiveTransaction | null = null;
  for (const t of transactions) {
    if (t.type === 'transfer' || !isUserEntry(t, excluded)) continue;
    if (!best || t.occurred_at > best.occurred_at || (t.occurred_at === best.occurred_at && t.id > best.id)) best = t;
  }
  return best;
}
