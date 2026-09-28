/**
 * Buckets are planned money, never expenses. Everything here is derived:
 *
 *   remaining(bucket) = allocated − this bucket's expenses
 *   unallocated       = account totals − reserved bills − goals − Σ remaining
 *
 * so the invariant  Σ remaining + reserved + goals + unallocated == account totals
 * holds by construction, and the functions that change allocations
 * (move, cover, split) are tested to keep it.
 */
import { daysLeftInMonth, type MonthKey } from './calendar';
import { CATEGORY_ID } from './defaults';
import { addPaise, assertPaise, subtractPaise, type Paise } from './money';
import type { EffectiveTransaction } from './types';

export type BucketRole = 'flexible' | 'savings' | null;

export interface Bucket {
  id: number;
  name: string;
  period_month: MonthKey;
  allocated_paise: Paise;
  role: BucketRole;
  sort_order: number;
  category_ids: number[];
  /** Removed by the user. Kept (hidden) because past expenses point at it. */
  removed?: boolean;
}

/** The buckets in use for a month (removed ones excluded). */
export function activeBuckets(buckets: readonly Bucket[], month: MonthKey): Bucket[] {
  return buckets.filter((b) => b.period_month === month && !b.removed);
}

export interface BucketStatus extends Bucket {
  spent_paise: Paise;
  remaining_paise: Paise;
}

export interface MoneyPicture {
  /** Sum of all account balances. */
  total_paise: Paise;
  /** Fixed bills still to pay this month. */
  reserved_paise: Paise;
  /** Set aside in active goals. */
  goals_paise: Paise;
  buckets: BucketStatus[];
  /** Σ remaining across this month's buckets. */
  in_buckets_paise: Paise;
  unallocated_paise: Paise;
  /** What the plan editor can hand out: Σ allocated + unallocated. */
  plan_pool_paise: Paise;
}

/** Expense total per bucket id (voided entries ignored). */
export function bucketSpending(transactions: readonly EffectiveTransaction[]): Map<number, Paise> {
  const spent = new Map<number, Paise>();
  for (const tx of transactions) {
    if (tx.voided || tx.type !== 'expense' || tx.bucket_id == null) continue;
    spent.set(tx.bucket_id, addPaise(spent.get(tx.bucket_id) ?? 0, tx.amount_paise));
  }
  return spent;
}

export function computeMoneyPicture(input: {
  balances: ReadonlyMap<number, Paise>;
  buckets: readonly Bucket[];
  transactions: readonly EffectiveTransaction[];
  reserved_paise: Paise;
  goals_paise?: Paise;
}): MoneyPicture {
  const total = addPaise(...input.balances.values());
  const goals = input.goals_paise ?? 0;
  assertPaise(input.reserved_paise);
  assertPaise(goals);
  const spending = bucketSpending(input.transactions);
  const buckets = [...input.buckets]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((b) => {
      const spent = spending.get(b.id) ?? 0;
      return { ...b, spent_paise: spent, remaining_paise: subtractPaise(b.allocated_paise, spent) };
    });
  const inBuckets = addPaise(...buckets.map((b) => b.remaining_paise));
  const unallocated = subtractPaise(subtractPaise(subtractPaise(total, input.reserved_paise), goals), inBuckets);
  const allocated = addPaise(...buckets.map((b) => b.allocated_paise));
  return {
    total_paise: total,
    reserved_paise: input.reserved_paise,
    goals_paise: goals,
    buckets,
    in_buckets_paise: inBuckets,
    unallocated_paise: unallocated,
    plan_pool_paise: addPaise(allocated, unallocated),
  };
}

export interface SafeToSpend {
  /** Rounded down, never negative. */
  per_day_paise: Paise;
  /** Flexible remaining + unallocated − uncovered overspends (may be negative). */
  pool_paise: Paise;
  days_left: number;
  /** How far below zero the pool is (0 if not). */
  over_paise: Paise;
}

/**
 * Safe to spend today = (Flexible remaining + unallocated) ÷ days left.
 * An overspent bucket that nobody covered has to be paid from that same
 * pool, so it is subtracted — the number never overstates.
 */
export function safeToSpend(picture: MoneyPicture, nowMs: number): SafeToSpend {
  const flexible = picture.buckets.find((b) => b.role === 'flexible');
  const uncovered = picture.buckets
    .filter((b) => b.role !== 'flexible' && b.remaining_paise < 0)
    .map((b) => b.remaining_paise);
  const pool = addPaise(flexible?.remaining_paise ?? 0, picture.unallocated_paise, ...uncovered);
  const days = daysLeftInMonth(nowMs);
  if (pool <= 0) return { per_day_paise: 0, pool_paise: pool, days_left: days, over_paise: -pool };
  return { per_day_paise: Math.floor(pool / days), pool_paise: pool, days_left: days, over_paise: 0 };
}

/** Which bucket a new expense in this category draws from. */
export function bucketForCategory(buckets: readonly Bucket[], categoryId: number | null): number | null {
  if (categoryId != null) {
    const mapped = buckets.find((b) => b.category_ids.includes(categoryId));
    if (mapped) return mapped.id;
  }
  return buckets.find((b) => b.role === 'flexible')?.id ?? null;
}

/**
 * Split `total` by whole percentages. When they add up to 100 the parts sum
 * to exactly `total` (largest-remainder rounding); below 100, each part is
 * rounded down and the rest stays unallocated.
 */
export function splitByPercent(total: Paise, percents: readonly number[]): Paise[] {
  assertPaise(total);
  if (total < 0) throw new Error('Cannot split a negative amount');
  let sum = 0;
  for (const p of percents) {
    if (!Number.isInteger(p) || p < 0 || p > 100) throw new Error(`Invalid percent ${p}`);
    sum += p;
  }
  if (sum > 100) throw new Error('Percentages add up to more than 100');

  const parts = percents.map((p) => Math.floor((total * p) / 100));
  if (sum === 100) {
    let leftover = total - parts.reduce((a, b) => a + b, 0);
    const order = percents
      .map((p, i) => ({ i, rem: (total * p) % 100 }))
      .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
      parts[order[k].i] += 1;
      leftover -= 1;
    }
  }
  return parts;
}

/** Whole-number share for display only (never used for money math). */
export function percentOf(part: Paise, whole: Paise): number {
  if (whole <= 0) return 0;
  return Math.round((part * 100) / whole);
}

export interface AllocationChange {
  id: number;
  allocated_paise: Paise;
}

/** Move planned money between buckets; only what is still left can move. */
export function moveBetweenBuckets(
  buckets: readonly BucketStatus[],
  fromId: number,
  toId: number,
  amount: Paise,
): AllocationChange[] {
  assertPaise(amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  if (fromId === toId) throw new Error('Pick two different buckets');
  const from = buckets.find((b) => b.id === fromId);
  const to = buckets.find((b) => b.id === toId);
  if (!from || !to) throw new Error('Bucket not found');
  if (amount > Math.max(from.remaining_paise, 0)) {
    throw new Error(`Only ${from.remaining_paise} paise left in ${from.name}`);
  }
  return [
    { id: from.id, allocated_paise: subtractPaise(from.allocated_paise, amount) },
    { id: to.id, allocated_paise: addPaise(to.allocated_paise, amount) },
  ];
}

/** Cover an overspent bucket from another, as far as the source allows. */
export function coverOverspend(
  buckets: readonly BucketStatus[],
  overspentId: number,
  fromId: number,
): { amount_paise: Paise; changes: AllocationChange[] } {
  const over = buckets.find((b) => b.id === overspentId);
  const from = buckets.find((b) => b.id === fromId);
  if (!over || !from) throw new Error('Bucket not found');
  const amount = Math.min(-over.remaining_paise, Math.max(from.remaining_paise, 0));
  if (amount <= 0) return { amount_paise: 0, changes: [] };
  return { amount_paise: amount, changes: moveBetweenBuckets(buckets, fromId, overspentId, amount) };
}

/** Buckets that could cover `overspentId`, Flexible first. */
export function coverCandidates(buckets: readonly BucketStatus[], overspentId: number): BucketStatus[] {
  return buckets
    .filter((b) => b.id !== overspentId && b.remaining_paise > 0)
    .sort((a, b) => Number(b.role === 'flexible') - Number(a.role === 'flexible') || a.sort_order - b.sort_order);
}

// ---------------------------------------------------------------------------
// Templates — starting points, never advice.
// ---------------------------------------------------------------------------

export type TemplateId = 'custom' | 'balanced' | 'student';

export interface TemplateBucket {
  name: string;
  percent: number;
  role: BucketRole;
  category_ids: number[];
}

export interface BucketTemplate {
  id: TemplateId;
  label: string;
  description: string;
  buckets: TemplateBucket[];
}

const C = CATEGORY_ID;

export const BUCKET_TEMPLATES: readonly BucketTemplate[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Savings, family, personal, fun and a flexible buffer',
    buckets: [
      { name: 'Savings', percent: 30, role: 'savings', category_ids: [] },
      { name: 'Family', percent: 20, role: null, category_ids: [C.family] },
      { name: 'Personal', percent: 20, role: null,
        category_ids: [C.food, C.chai, C.groceries, C.transport, C.health, C.shopping, C.bills] },
      { name: 'Entertainment', percent: 10, role: null, category_ids: [C.entertainment] },
      { name: 'Education/Activities', percent: 10, role: null, category_ids: [C.education] },
      { name: 'Flexible', percent: 10, role: 'flexible', category_ids: [C.other] },
    ],
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Education first, with savings and some fun',
    buckets: [
      { name: 'Education', percent: 25, role: null, category_ids: [C.education] },
      { name: 'Savings', percent: 30, role: 'savings', category_ids: [] },
      { name: 'Personal', percent: 20, role: null,
        category_ids: [C.food, C.chai, C.groceries, C.health, C.shopping, C.bills] },
      { name: 'Entertainment', percent: 10, role: null, category_ids: [C.entertainment] },
      { name: 'Transport', percent: 10, role: null, category_ids: [C.transport] },
      { name: 'Other', percent: 5, role: 'flexible', category_ids: [C.other] },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start empty and set everything yourself',
    buckets: [
      { name: 'Savings', percent: 0, role: 'savings', category_ids: [] },
      { name: 'Flexible', percent: 0, role: 'flexible', category_ids: [] },
    ],
  },
];

export interface SafeToSpendStep {
  label: string;
  paise: Paise;
  op: 'start' | 'minus' | 'equals';
}

/**
 * The same number as safeToSpend(), explained step by step:
 *   accounts − bills − goals − still planned in other buckets = free money
 *   free money ÷ days left = safe to spend today
 * (Flexible and unplanned money are both "free"; an overspend nobody
 * covered is already inside the lower totals.)
 */
export function explainSafeToSpend(picture: MoneyPicture, nowMs: number): {
  steps: SafeToSpendStep[];
  pool_paise: Paise;
  days_left: number;
  per_day_paise: Paise;
} {
  const plannedElsewhere = addPaise(
    ...picture.buckets.filter((b) => b.role !== 'flexible' && b.remaining_paise > 0).map((b) => b.remaining_paise),
  );
  const pool = subtractPaise(
    subtractPaise(subtractPaise(picture.total_paise, picture.reserved_paise), picture.goals_paise),
    plannedElsewhere,
  );
  const safe = safeToSpend(picture, nowMs);
  if (pool !== safe.pool_paise) throw new Error('Safe-to-spend explanation does not add up');

  const steps: SafeToSpendStep[] = [{ label: 'Money in all your accounts', paise: picture.total_paise, op: 'start' }];
  if (picture.reserved_paise > 0) steps.push({ label: 'Kept aside for bills still due this month', paise: picture.reserved_paise, op: 'minus' });
  if (picture.goals_paise > 0) steps.push({ label: 'Set aside in your goals', paise: picture.goals_paise, op: 'minus' });
  if (plannedElsewhere > 0) steps.push({ label: 'Still planned in your buckets (except Flexible)', paise: plannedElsewhere, op: 'minus' });
  steps.push({ label: 'Free to spend for the rest of this month', paise: pool, op: 'equals' });
  return { steps, pool_paise: pool, days_left: safe.days_left, per_day_paise: safe.per_day_paise };
}
