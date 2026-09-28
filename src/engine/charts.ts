/** Data for the Insights charts. Pure; money stays integer paise. */
import { daysInMonth, monthKey, monthStartMs, shiftMonth, type MonthKey } from './calendar';
import { ADJUSTMENT_CATEGORY } from './defaults';
import { everydayExpenses, spendingByCategory } from './insights';
import { addPaise, type Paise } from './money';
import type { Category, EffectiveTransaction } from './types';

export interface CategorySlice {
  category_id: number | null;
  name: string;
  icon: string;
  paise: Paise;
  /** Whole-number share of the total, for labels only. */
  percent: number;
}

/** Ranked spending by category for a month; the tail folds into "Other". */
export function categoryBreakdown(
  transactions: readonly EffectiveTransaction[],
  categories: readonly Pick<Category, 'id' | 'name' | 'icon'>[],
  month: MonthKey,
  excludedIds: ReadonlySet<number> = new Set(),
  maxRows = 6,
): { total_paise: Paise; slices: CategorySlice[] } {
  const spent = spendingByCategory(
    everydayExpenses(transactions, excludedIds),
    monthStartMs(month),
    monthStartMs(shiftMonth(month, 1)),
  );
  const rows = [...spent.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = addPaise(...rows.map(([, v]) => v));
  const toSlice = (id: number | null, paise: Paise): CategorySlice => {
    const c = categories.find((x) => x.id === id);
    return {
      category_id: id, name: c?.name ?? 'Other', icon: c?.icon ?? '📦', paise,
      percent: total > 0 ? Math.round((paise * 100) / total) : 0,
    };
  };
  const head = rows.slice(0, rows.length > maxRows ? maxRows - 1 : maxRows).map(([id, v]) => toSlice(id, v));
  if (rows.length > maxRows) {
    const rest = addPaise(...rows.slice(maxRows - 1).map(([, v]) => v));
    head.push({ ...toSlice(null, rest), name: 'Everything else', icon: '···', category_id: -1 });
  }
  return { total_paise: total, slices: head };
}

export interface MonthFlow {
  month: MonthKey;
  in_paise: Paise;
  out_paise: Paise;
}

/**
 * Money in vs out for the last `months` months (current month last).
 * Balance updates are excluded; bills count as money out.
 */
export function monthlyFlows(transactions: readonly EffectiveTransaction[], nowMs: number, months = 6): MonthFlow[] {
  const current = monthKey(nowMs);
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(current, i - months + 1));
  const flows = new Map<MonthKey, MonthFlow>(keys.map((k) => [k, { month: k, in_paise: 0, out_paise: 0 }]));
  for (const t of transactions) {
    if (t.voided || t.category_id === ADJUSTMENT_CATEGORY.id) continue;
    const f = flows.get(monthKey(t.occurred_at));
    if (!f) continue;
    if (t.type === 'income') f.in_paise = addPaise(f.in_paise, t.amount_paise);
    else if (t.type === 'expense') f.out_paise = addPaise(f.out_paise, t.amount_paise);
  }
  return keys.map((k) => flows.get(k)!);
}

/** Everyday spending per day of the current month, up to today. */
export function dailySpending(
  transactions: readonly EffectiveTransaction[],
  nowMs: number,
  excludedIds: ReadonlySet<number> = new Set(),
): { day: number; paise: Paise }[] {
  const now = new Date(nowMs);
  const days = Math.min(now.getDate(), daysInMonth(now.getFullYear(), now.getMonth()));
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, paise: 0 }));
  const key = monthKey(nowMs);
  for (const t of everydayExpenses(transactions, excludedIds)) {
    if (monthKey(t.occurred_at) !== key) continue;
    const d = new Date(t.occurred_at).getDate();
    if (d <= days) out[d - 1].paise = addPaise(out[d - 1].paise, t.amount_paise);
  }
  return out;
}
