import { categoryBreakdown, dailySpending, monthlyFlows } from '../charts';
import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../defaults';
import { resolveTransactions } from '../ledger';
import type { TransactionRow } from '../types';

let id = 1;
const at = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: id++, account_id: 1, category_id: C.food, bucket_id: null, amount_paise: 1_000, type: 'expense',
  note: null, created_at: at(9, 10), corrects_id: null, ...p,
});

describe('charts', () => {
  it('ranks categories, folds the tail and leaves out balance updates and bills', () => {
    const rows = [
      tx({ category_id: C.food, amount_paise: 50_000 }),
      tx({ category_id: C.chai, amount_paise: 10_000 }),
      tx({ category_id: C.transport, amount_paise: 20_000 }),
      tx({ category_id: C.shopping, amount_paise: 5_000 }),
      tx({ category_id: C.health, amount_paise: 4_000 }),
      tx({ category_id: C.bills, amount_paise: 3_000 }),
      tx({ category_id: C.other, amount_paise: 2_000 }),
      tx({ category_id: 17, amount_paise: 999_999 }),
      tx({ id: 900, category_id: C.rent, amount_paise: 800_000 }),
      tx({ category_id: C.food, amount_paise: 7, created_at: at(8, 1) }),
    ];
    const r = categoryBreakdown(resolveTransactions(rows), DEFAULT_CATEGORIES, '2026-09', new Set([900]));
    expect(r.total_paise).toBe(94_000);
    expect(r.slices.map((s) => [s.name, s.paise])).toEqual([
      ['Food', 50_000], ['Transport', 20_000], ['Chai & Snacks', 10_000], ['Shopping', 5_000], ['Health', 4_000],
      ['Everything else', 5_000],
    ]);
    expect(r.slices[0].percent).toBe(53);
  });

  it('builds 6 months of in/out with the current month last', () => {
    const rows = [
      tx({ type: 'income', category_id: C.salary, amount_paise: 3_000_000, created_at: at(9, 1) }),
      tx({ amount_paise: 50_000, created_at: at(9, 2) }),
      tx({ amount_paise: 70_000, created_at: at(4, 2) }),
      tx({ amount_paise: 1, created_at: at(3, 2) }), // older than 6 months
      tx({ type: 'income', category_id: 17, amount_paise: 5, created_at: at(9, 3) }),
    ];
    const flows = monthlyFlows(resolveTransactions(rows), at(9, 28));
    expect(flows.map((f) => f.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(flows[0]).toMatchObject({ in_paise: 0, out_paise: 70_000 });
    expect(flows[5]).toMatchObject({ in_paise: 3_000_000, out_paise: 50_000 });
  });

  it('daily spending up to today', () => {
    const rows = [tx({ amount_paise: 100, created_at: at(9, 1) }), tx({ amount_paise: 200, created_at: at(9, 1) }), tx({ amount_paise: 50, created_at: at(9, 3) })];
    expect(dailySpending(resolveTransactions(rows), at(9, 3))).toEqual([
      { day: 1, paise: 300 }, { day: 2, paise: 0 }, { day: 3, paise: 50 },
    ]);
  });
});
