/**
 * "Can I afford this?" — simulate the purchase on the money picture and
 * describe the impact. Pure math; the user always decides.
 */
import {
  bucketForCategory,
  safeToSpend,
  type BucketStatus,
  type MoneyPicture,
  type SafeToSpend,
} from './buckets';
import { monthsToReach, type GoalStatus } from './goals';
import { assertPaise, formatINR, subtractPaise, type Paise } from './money';

export type AffordVerdict = 'comfortable' | 'tight' | 'bucket_over' | 'short';

export interface AffordResult {
  verdict: AffordVerdict;
  bucket: { name: string; remaining_before: Paise; remaining_after: Paise } | null;
  safe_before: SafeToSpend;
  safe_after: SafeToSpend;
  /** How many days of today's safe-to-spend it uses (rounded up), if any. */
  days_of_free_money: number | null;
  /** How much would have to come from savings/goals money. */
  short_paise: Paise;
  /** A goal that could be pushed back, with roughly how many months. */
  goal_delay: { name: string; months: number } | null;
  headline: string;
  details: string[];
}

export function canIAfford(input: {
  picture: MoneyPicture;
  amount_paise: Paise;
  category_id: number | null;
  goals: readonly GoalStatus[];
  nowMs: number;
}): AffordResult {
  const { picture, amount_paise: amount, nowMs } = input;
  assertPaise(amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  const safeBefore = safeToSpend(picture, nowMs);
  const bucketId = bucketForCategory(picture.buckets, input.category_id);
  const bucket = picture.buckets.find((b) => b.id === bucketId) ?? null;

  // After buying: the account total drops; the bucket (if any) is drawn down,
  // otherwise it comes straight out of unallocated money.
  const buckets: BucketStatus[] = picture.buckets.map((b) =>
    b.id === bucketId
      ? { ...b, spent_paise: b.spent_paise + amount, remaining_paise: subtractPaise(b.remaining_paise, amount) }
      : b,
  );
  const after: MoneyPicture = {
    ...picture,
    total_paise: subtractPaise(picture.total_paise, amount),
    buckets,
    in_buckets_paise: bucket ? subtractPaise(picture.in_buckets_paise, amount) : picture.in_buckets_paise,
    unallocated_paise: bucket ? picture.unallocated_paise : subtractPaise(picture.unallocated_paise, amount),
  };
  const safeAfter = safeToSpend(after, nowMs);

  const bucketAfter = bucket ? subtractPaise(bucket.remaining_paise, amount) : null;
  const short = safeAfter.pool_paise < 0 ? Math.min(-safeAfter.pool_paise, amount) : 0;

  let goalDelay: AffordResult['goal_delay'] = null;
  if (short > 0) {
    const goal = input.goals.find((g) => g.status === 'active' && g.remaining_paise > 0 && g.pace_paise > 0);
    const months = goal ? monthsToReach(short, goal.pace_paise) : null;
    if (goal && months) goalDelay = { name: goal.name, months };
  }

  let verdict: AffordVerdict;
  if (short > 0) verdict = 'short';
  else if (bucketAfter != null && bucketAfter < 0 && bucket?.role !== 'flexible') verdict = 'bucket_over';
  else if (safeAfter.per_day_paise * 2 < safeBefore.per_day_paise) verdict = 'tight';
  else verdict = 'comfortable';

  const daysUsed = safeBefore.per_day_paise > 0 ? Math.ceil(amount / safeBefore.per_day_paise) : null;
  const fmt = (p: Paise) => formatINR(p, { paise: 'never' });

  const headline = {
    comfortable: 'Yes, comfortably.',
    tight: "Yes, but it's a bit tight.",
    bucket_over: `Yes, but ${bucket?.name ?? 'that bucket'} goes over.`,
    short: `Not from this month's free money — you'd be ${fmt(short)} short.`,
  }[verdict];

  const details: string[] = [];
  if (bucket && bucketAfter != null) {
    details.push(
      bucketAfter >= 0
        ? `${bucket.name}: ${fmt(bucket.remaining_paise)} → ${fmt(bucketAfter)} left.`
        : `${bucket.name}: ${fmt(bucket.remaining_paise)} left, so it goes ${fmt(-bucketAfter)} over (you can cover it from another bucket).`,
    );
  }
  details.push(`Safe to spend: ${fmt(safeBefore.per_day_paise)} → ${fmt(safeAfter.per_day_paise)} a day.`);
  if (daysUsed != null && verdict !== 'short') {
    details.push(`That's about ${daysUsed} ${daysUsed === 1 ? "day's" : "days'"} worth of free money.`);
  }
  if (short > 0) {
    details.push(`The rest would have to come from savings or goal money.`);
    if (goalDelay) {
      details.push(`That could push ${goalDelay.name} back by about ${goalDelay.months} ${goalDelay.months === 1 ? 'month' : 'months'}.`);
    }
  }
  details.push("It's your call — this just shows the numbers.");

  return {
    verdict,
    bucket: bucket && bucketAfter != null ? { name: bucket.name, remaining_before: bucket.remaining_paise, remaining_after: bucketAfter } : null,
    safe_before: safeBefore,
    safe_after: safeAfter,
    days_of_free_money: daysUsed,
    short_paise: short,
    goal_delay: goalDelay,
    headline,
    details,
  };
}
