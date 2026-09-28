/**
 * Rule-based insights, friendly and non-judgmental. Numbers come from the
 * engine only. Balance updates and confirmed bills are left out so they
 * don't skew spending patterns.
 */
import type { BucketStatus } from './buckets';
import { daysInMonth, monthKey, monthStartMs, shiftMonth } from './calendar';
import { ADJUSTMENT_CATEGORY } from './defaults';
import { addPaise, formatINR, type Paise } from './money';
import type { Category, EffectiveTransaction } from './types';

export interface Insight {
  id: string;
  kind: 'pace' | 'bucket' | 'trend_up' | 'trend_down';
  text: string;
}

/** Everyday expenses: not voided, not balance updates, not confirmed bills. */
export function everydayExpenses(
  transactions: readonly EffectiveTransaction[],
  excludedIds: ReadonlySet<number> = new Set(),
): EffectiveTransaction[] {
  return transactions.filter(
    (t) => t.type === 'expense' && !t.voided && t.category_id !== ADJUSTMENT_CATEGORY.id && !excludedIds.has(t.id),
  );
}

/** Spending per category between two instants [from, to). */
export function spendingByCategory(
  expenses: readonly EffectiveTransaction[],
  fromMs: number,
  toMs: number,
): Map<number | null, Paise> {
  const out = new Map<number | null, Paise>();
  for (const t of expenses) {
    if (t.occurred_at < fromMs || t.occurred_at >= toMs) continue;
    out.set(t.category_id, addPaise(out.get(t.category_id) ?? 0, t.amount_paise));
  }
  return out;
}

/** Only compare categories with at least this much last month (avoids noise). */
export const TREND_MIN_PAISE = 50_000;
export const TREND_MIN_PERCENT = 25;
export const BUCKET_WARN_PERCENT = 80;
/** Projections need a few days of data first. */
export const PACE_MIN_DAY = 5;

export function computeInsights(input: {
  transactions: readonly EffectiveTransaction[];
  excludedIds?: ReadonlySet<number>;
  categories: readonly Pick<Category, 'id' | 'name'>[];
  buckets: readonly BucketStatus[];
  nowMs: number;
  limit?: number;
}): Insight[] {
  const { nowMs, buckets } = input;
  const now = new Date(nowMs);
  const day = now.getDate();
  const dim = daysInMonth(now.getFullYear(), now.getMonth());
  const out: Insight[] = [];

  // 1. Pace: projected month total vs plan, per bucket.
  if (day >= PACE_MIN_DAY) {
    for (const b of buckets) {
      if (b.spent_paise <= 0 || b.allocated_paise <= 0 || b.remaining_paise < 0) continue;
      const projected = Math.floor((b.spent_paise * dim) / day);
      const over = projected - b.allocated_paise;
      if (over >= Math.max(10_000, Math.floor(b.allocated_paise / 20))) {
        out.push({
          id: `pace-${b.id}`,
          kind: 'pace',
          text: `At this pace you'll go about ${formatINR(over, { paise: 'never' })} over on ${b.name}. Slowing down a little evens it out.`,
        });
      }
    }
  }

  // 2. Buckets nearly used up.
  for (const b of buckets) {
    if (b.allocated_paise <= 0 || b.remaining_paise <= 0) continue;
    const used = Math.floor((b.spent_paise * 100) / b.allocated_paise);
    if (used >= BUCKET_WARN_PERCENT) {
      out.push({
        id: `bucket-${b.id}`,
        kind: 'bucket',
        text: `${b.name} bucket is at ${used}% — ${formatINR(b.remaining_paise, { paise: 'never' })} left.`,
      });
    }
  }

  // 3. Category trend: this month so far vs the same days last month.
  const expenses = everydayExpenses(input.transactions, input.excludedIds);
  const thisKey = monthKey(nowMs);
  const lastKey = shiftMonth(thisKey, -1);
  const thisStart = monthStartMs(thisKey);
  const lastStart = monthStartMs(lastKey);
  const lastDate = new Date(lastStart);
  const lastDays = daysInMonth(lastDate.getFullYear(), lastDate.getMonth());
  const lastEnd = new Date(lastDate.getFullYear(), lastDate.getMonth(), Math.min(day, lastDays) + 1).getTime();
  const thisEnd = new Date(now.getFullYear(), now.getMonth(), day + 1).getTime();
  const current = spendingByCategory(expenses, thisStart, thisEnd);
  const previous = spendingByCategory(expenses, lastStart, Math.min(lastEnd, thisStart));

  let bestTrend: (Insight & { size: number }) | null = null;
  for (const [categoryId, before] of previous) {
    if (categoryId == null || before < TREND_MIN_PAISE) continue;
    const now_ = current.get(categoryId) ?? 0;
    const change = Math.round(((now_ - before) * 100) / before);
    if (Math.abs(change) < TREND_MIN_PERCENT) continue;
    const name = input.categories.find((c) => c.id === categoryId)?.name ?? 'Spending';
    const insight =
      change > 0
        ? { id: `trend-${categoryId}`, kind: 'trend_up' as const, text: `${name} is ${change}% higher than this time last month (${formatINR(now_, { paise: 'never' })} vs ${formatINR(before, { paise: 'never' })}).` }
        : { id: `trend-${categoryId}`, kind: 'trend_down' as const, text: `Nice — ${name} is ${-change}% lower than this time last month.` };
    const size = Math.abs(now_ - before);
    if (!bestTrend || size > bestTrend.size) bestTrend = { ...insight, size };
  }
  if (bestTrend) {
    const { size: _size, ...insight } = bestTrend;
    out.push(insight);
  }

  return out.slice(0, input.limit ?? 3);
}
