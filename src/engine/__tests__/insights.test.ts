import type { BucketStatus } from '../buckets';
import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../defaults';
import { computeInsights, everydayExpenses } from '../insights';
import { resolveTransactions } from '../ledger';
import type { TransactionRow } from '../types';

let id = 1;
const at = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: id++, account_id: 1, category_id: C.food, bucket_id: null, amount_paise: 1_000, type: 'expense',
  note: null, created_at: at(9, 10), corrects_id: null, ...p,
});
const bucket = (p: Partial<BucketStatus>): BucketStatus => ({
  id: 1, name: 'Personal', period_month: '2026-09', allocated_paise: 100_000, role: null, sort_order: 0,
  category_ids: [], spent_paise: 0, remaining_paise: 100_000, ...p,
});

describe('insights', () => {
  const now = at(9, 15);

  it('compares this month so far with the same days last month', () => {
    const rows = [
      tx({ amount_paise: 100_000, created_at: at(8, 5) }),
      tx({ amount_paise: 999_000, created_at: at(8, 25) }), // after day 15 last month: ignored
      tx({ amount_paise: 130_000, created_at: at(9, 3) }),
    ];
    const out = computeInsights({ transactions: resolveTransactions(rows), categories: [...DEFAULT_CATEGORIES], buckets: [], nowMs: now });
    expect(out.map((i) => i.text)).toEqual(['Food is 30% higher than this time last month (₹1,300 vs ₹1,000).']);
  });

  it('celebrates spending less, and ignores small categories', () => {
    const rows = [
      tx({ category_id: C.transport, amount_paise: 200_000, created_at: at(8, 2) }),
      tx({ category_id: C.transport, amount_paise: 100_000, created_at: at(9, 2) }),
      tx({ category_id: C.chai, amount_paise: 10_000, created_at: at(8, 2) }),
    ];
    const out = computeInsights({ transactions: resolveTransactions(rows), categories: [...DEFAULT_CATEGORIES], buckets: [], nowMs: now });
    expect(out.map((i) => i.kind)).toEqual(['trend_down']);
    expect(out[0].text).toContain('Transport is 50% lower');
  });

  it('warns gently about pace and nearly-used buckets', () => {
    const b = bucket({ spent_paise: 85_000, remaining_paise: 15_000 });
    const out = computeInsights({ transactions: [], categories: [], buckets: [b], nowMs: now });
    expect(out.map((i) => i.kind)).toEqual(['pace', 'bucket']);
    expect(out[0].text).toContain("you'll go about ₹700 over on Personal");
    expect(out[1].text).toBe('Personal bucket is at 85% — ₹150 left.');
  });

  it('waits a few days before projecting', () => {
    const b = bucket({ spent_paise: 50_000, remaining_paise: 50_000 });
    expect(computeInsights({ transactions: [], categories: [], buckets: [b], nowMs: at(9, 2) })).toEqual([]);
  });

  it('leaves out balance updates and confirmed bills', () => {
    const rows = [tx({ category_id: 17 }), tx({ id: 500 }), tx({ amount_paise: 7 })];
    const out = everydayExpenses(resolveTransactions(rows), new Set([500]));
    expect(out.map((t) => t.amount_paise)).toEqual([7]);
  });
});
