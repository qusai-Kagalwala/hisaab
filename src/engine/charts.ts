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
      category_id: id, name: c?.name ?? 'Other', icon: c?.icon ?? 'dots-horizontal-circle', paise,
      percent: total > 0 ? Math.round((paise * 100) / total) : 0,
    };
  };
  const head = rows.slice(0, rows.length > maxRows ? maxRows - 1 : maxRows).map(([id, v]) => toSlice(id, v));
  if (rows.length > maxRows) {
    const rest = addPaise(...rows.slice(maxRows - 1).map(([, v]) => v));
    head.push({ ...toSlice(null, rest), name: 'Everything else', icon: 'dots-horizontal', category_id: -1 });
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

export interface MonthStats {
  month: MonthKey;
  in_paise: Paise;
  /** All money out, bills included (balance updates and transfers left out). */
  out_paise: Paise;
  /** in − out; negative when more went out than came in. */
  saved_paise: Paise;
  /** Whole-number share of income kept, for display only; null with no income. */
  saved_percent: number | null;
  /** Everyday spending (no bills). */
  everyday_paise: Paise;
  /** Everyday spending ÷ days counted, rounded down. */
  average_per_day_paise: Paise;
  days_counted: number;
  /** Up to three days with the most everyday spending, biggest first. */
  top_days: { day: number; paise: Paise }[];
  /** The single biggest everyday expense. */
  largest: EffectiveTransaction | null;
  entries: number;
}

/** Totals for one month. For the current month, days are counted up to today. */
export function monthStats(
  transactions: readonly EffectiveTransaction[],
  month: MonthKey,
  nowMs: number,
  excludedIds: ReadonlySet<number> = new Set(),
): MonthStats {
  const from = monthStartMs(month);
  const to = monthStartMs(shiftMonth(month, 1));
  const inMonth = (t: EffectiveTransaction) => t.occurred_at >= from && t.occurred_at < to;
  let inP: Paise = 0;
  let outP: Paise = 0;
  let entries = 0;
  for (const t of transactions) {
    if (t.voided || !inMonth(t)) continue;
    entries += 1;
    if (t.category_id === ADJUSTMENT_CATEGORY.id) continue;
    if (t.type === 'income') inP = addPaise(inP, t.amount_paise);
    else if (t.type === 'expense') outP = addPaise(outP, t.amount_paise);
  }
  const everyday = everydayExpenses(transactions, excludedIds).filter(inMonth);
  const byDay = new Map<number, Paise>();
  let largest: EffectiveTransaction | null = null;
  for (const t of everyday) {
    const d = new Date(t.occurred_at).getDate();
    byDay.set(d, addPaise(byDay.get(d) ?? 0, t.amount_paise));
    if (!largest || t.amount_paise > largest.amount_paise) largest = t;
  }
  const everydayTotal = addPaise(...everyday.map((t) => t.amount_paise));
  const [y, m] = month.split('-').map(Number);
  const current = monthKey(nowMs) === month;
  const days = current ? new Date(nowMs).getDate() : nowMs < from ? 0 : daysInMonth(y, m - 1);
  const saved = inP - outP;
  return {
    month,
    in_paise: inP,
    out_paise: outP,
    saved_paise: saved,
    saved_percent: inP > 0 ? Math.round((saved * 100) / inP) : null,
    everyday_paise: everydayTotal,
    average_per_day_paise: days > 0 ? Math.floor(everydayTotal / days) : 0,
    days_counted: days,
    top_days: [...byDay.entries()]
      .map(([day, paise]) => ({ day, paise }))
      .sort((a, b) => b.paise - a.paise || a.day - b.day)
      .slice(0, 3),
    largest,
    entries,
  };
}

/** The months that have any entries, oldest first, always including `current`. */
export function monthsWithEntries(transactions: readonly EffectiveTransaction[], current: MonthKey): MonthKey[] {
  const keys = new Set<MonthKey>([current]);
  for (const t of transactions) if (!t.voided) keys.add(monthKey(t.occurred_at));
  return [...keys].filter((k) => k <= current).sort();
}
