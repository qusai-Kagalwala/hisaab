/**
 * Month-end rollover. The new month copies last month's bucket setup with
 * nothing allocated, then each bucket's leftover goes where the user chose.
 * Leftovers nobody decides on simply show up as unallocated money.
 */
import type { BucketRole, BucketStatus } from './buckets';
import { addPaise, type Paise } from './money';

export type RolloverChoice = 'keep' | 'savings' | 'flexible';

export interface NewMonthBucket {
  name: string;
  role: BucketRole;
  sort_order: number;
  category_ids: number[];
  allocated_paise: Paise;
}

/** Buckets whose leftover needs a decision. */
export function leftoverBuckets(previous: readonly BucketStatus[]): BucketStatus[] {
  return previous.filter((b) => b.remaining_paise > 0);
}

/** Choices that make sense for a bucket (no "move to Savings" for Savings itself). */
export function choicesFor(bucket: BucketStatus, previous: readonly BucketStatus[]): RolloverChoice[] {
  const result: RolloverChoice[] = ['keep'];
  if (bucket.role !== 'savings' && previous.some((b) => b.role === 'savings')) result.push('savings');
  if (bucket.role !== 'flexible' && previous.some((b) => b.role === 'flexible')) result.push('flexible');
  return result;
}

export function planRollover(
  previous: readonly BucketStatus[],
  choices: ReadonlyMap<number, RolloverChoice>,
): NewMonthBucket[] {
  const next: NewMonthBucket[] = [...previous]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((b) => ({
      name: b.name,
      role: b.role,
      sort_order: b.sort_order,
      category_ids: [...b.category_ids],
      allocated_paise: 0,
    }));

  for (const b of leftoverBuckets(previous)) {
    const choice = choices.get(b.id) ?? 'keep';
    const allowed = choicesFor(b, previous);
    const effective = allowed.includes(choice) ? choice : 'keep';
    const target =
      effective === 'keep'
        ? next.find((n) => n.name === b.name)
        : next.find((n) => n.role === effective);
    if (!target) throw new Error(`No target bucket for ${b.name}`);
    target.allocated_paise = addPaise(target.allocated_paise, b.remaining_paise);
  }
  return next;
}
