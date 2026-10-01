import { canIAfford } from '../afford';
import type { BucketStatus, MoneyPicture } from '../buckets';
import { CATEGORY_ID as C } from '../defaults';
import type { GoalStatus } from '../goals';

const now = new Date(2026, 8, 21, 12).getTime(); // 10 days left
const b = (p: Partial<BucketStatus>): BucketStatus => ({
  id: 1, name: 'B', period_month: '2026-09', allocated_paise: 0, role: null, sort_order: 0, category_ids: [],
  spent_paise: 0, remaining_paise: 0, ...p,
});
const picture = (buckets: BucketStatus[], unallocated: number): MoneyPicture => ({
  total_paise: 0, reserved_paise: 0, repayments_paise: 0, savings_paise: 0, goals_paise: 0, buckets,
  in_buckets_paise: buckets.reduce((a, x) => a + x.remaining_paise, 0), unallocated_paise: unallocated, plan_pool_paise: 0,
});
const flexible = b({ id: 9, name: 'Flexible', role: 'flexible', allocated_paise: 100_000, remaining_paise: 100_000 });
const fun = b({ id: 2, name: 'Entertainment', category_ids: [C.entertainment], allocated_paise: 300_000, remaining_paise: 300_000 });
const laptop = { name: 'Laptop', status: 'active', remaining_paise: 1_000_000, pace_paise: 200_000 } as GoalStatus;

describe('canIAfford', () => {
  it('comfortable when it fits the bucket', () => {
    const r = canIAfford({ picture: picture([fun, flexible], 0), amount_paise: 45_000, category_id: C.entertainment, goals: [], nowMs: now });
    expect(r.verdict).toBe('comfortable');
    expect(r.bucket).toEqual({ name: 'Entertainment', remaining_before: 300_000, remaining_after: 255_000 });
    expect(r.safe_after.per_day_paise).toBe(r.safe_before.per_day_paise); // Flexible untouched
  });

  it('flags a bucket going over, and the uncovered part reduces safe-to-spend', () => {
    const r = canIAfford({ picture: picture([fun, flexible], 0), amount_paise: 350_000, category_id: C.entertainment, goals: [], nowMs: now });
    expect(r.verdict).toBe('bucket_over');
    expect(r.safe_after.pool_paise).toBe(50_000);
    expect(r.headline).toBe('Yes, but Entertainment goes over.');
  });

  it('tight when it eats more than half of the daily amount', () => {
    const r = canIAfford({ picture: picture([flexible], 0), amount_paise: 60_000, category_id: C.shopping, goals: [], nowMs: now });
    expect(r.verdict).toBe('tight');
    expect(r.days_of_free_money).toBe(6);
  });

  it('short when free money runs out, with a goal delay estimate', () => {
    const r = canIAfford({ picture: picture([], 50_000), amount_paise: 250_000, category_id: C.shopping, goals: [laptop], nowMs: now });
    expect(r).toMatchObject({ verdict: 'short', short_paise: 200_000, goal_delay: { name: 'Laptop', months: 1 } });
    expect(r.headline).toBe("Not from this month's free money — you'd be ₹2,000 short.");
    expect(r.details.at(-1)).toBe("It's your call — this just shows the numbers.");
  });

  it('rejects bad amounts', () => {
    expect(() => canIAfford({ picture: picture([], 0), amount_paise: 0, category_id: null, goals: [], nowMs: now })).toThrow();
  });
});
