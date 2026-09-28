import type { BucketStatus } from '../buckets';
import { choicesFor, leftoverBuckets, planRollover, rolloverSource, type RolloverChoice } from '../rollover';

function status(id: number, name: string, remaining: number, role: BucketStatus['role'] = null): BucketStatus {
  return {
    id, name, period_month: '2026-09', allocated_paise: Math.max(remaining, 0), role, sort_order: id,
    category_ids: [id], spent_paise: 0, remaining_paise: remaining,
  };
}

const previous = [
  status(1, 'Savings', 500_000, 'savings'),
  status(2, 'Entertainment', 55_000),
  status(3, 'Personal', -20_000),
  status(4, 'Flexible', 10_000, 'flexible'),
];

describe('rollover', () => {
  it('copies the structure with nothing allocated when no one has leftovers', () => {
    const next = planRollover(previous.map((b) => ({ ...b, remaining_paise: 0 })), new Map());
    expect(next.map((b) => [b.name, b.allocated_paise, b.role])).toEqual([
      ['Savings', 0, 'savings'], ['Entertainment', 0, null], ['Personal', 0, null], ['Flexible', 0, 'flexible'],
    ]);
    expect(next[1].category_ids).toEqual([2]);
  });

  it('keeps by default and routes to Savings or Flexible when chosen', () => {
    const choices = new Map<number, RolloverChoice>([[2, 'savings'], [4, 'keep']]);
    const next = planRollover(previous, choices);
    expect(next.find((b) => b.name === 'Savings')?.allocated_paise).toBe(555_000);
    expect(next.find((b) => b.name === 'Entertainment')?.allocated_paise).toBe(0);
    expect(next.find((b) => b.name === 'Personal')?.allocated_paise).toBe(0); // overspend doesn't carry
    expect(next.find((b) => b.name === 'Flexible')?.allocated_paise).toBe(10_000);
  });

  it('moves exactly the positive leftovers, no more, no less', () => {
    for (const choice of ['keep', 'savings', 'flexible'] as const) {
      const next = planRollover(previous, new Map(previous.map((b) => [b.id, choice])));
      const moved = next.reduce((a, b) => a + b.allocated_paise, 0);
      expect(moved).toBe(565_000);
    }
  });

  it('offers only choices that make sense', () => {
    expect(leftoverBuckets(previous).map((b) => b.id)).toEqual([1, 2, 4]);
    expect(choicesFor(previous[0], previous)).toEqual(['keep', 'flexible']);
    expect(choicesFor(previous[1], previous)).toEqual(['keep', 'savings', 'flexible']);
    expect(choicesFor(previous[1], [previous[1]])).toEqual(['keep']);
  });
});

describe('rolloverSource', () => {
  const b = (month: string, removed = false) => ({ ...status(1, 'X', 0), period_month: month, removed });

  it('rolls over from the latest earlier month that had buckets in use', () => {
    expect(rolloverSource([b('2026-08'), b('2026-09')], '2026-10')).toBe('2026-09');
    expect(rolloverSource([], '2026-10')).toBeNull();
  });

  it('does nothing once this month has any buckets, even removed ones', () => {
    expect(rolloverSource([b('2026-09'), b('2026-10', true)], '2026-10')).toBeNull();
  });

  it('treats a month whose buckets were all removed as "buckets off"', () => {
    expect(rolloverSource([b('2026-08'), b('2026-09', true)], '2026-10')).toBeNull();
  });
});
