import { monthStats, monthsWithEntries } from '../charts';
import { ADJUSTMENT_CATEGORY } from '../defaults';
import type { EffectiveTransaction } from '../types';

let id = 1;
function tx(partial: Partial<EffectiveTransaction>): EffectiveTransaction {
  return {
    id: id++, type: 'expense', account_id: 1, category_id: 1, bucket_id: null, amount_paise: 1_000, note: null,
    occurred_at: new Date(2026, 8, 10, 12).getTime(), corrected_by: null, voided: false, ...partial,
  };
}
const on = (d: number, m = 9) => new Date(2026, m - 1, d, 12).getTime();

describe('monthStats', () => {
  const rent = tx({ amount_paise: 800_000, occurred_at: on(1) });
  const txs = [
    tx({ type: 'income', category_id: 13, amount_paise: 3_000_000, occurred_at: on(1) }),
    rent,
    tx({ amount_paise: 2_000, occurred_at: on(3) }),
    tx({ amount_paise: 50_000, occurred_at: on(3) }),
    tx({ amount_paise: 30_000, occurred_at: on(7) }),
    tx({ amount_paise: 9_000, occurred_at: on(9), voided: true }),
    tx({ type: 'income', category_id: ADJUSTMENT_CATEGORY.id, amount_paise: 99_000, occurred_at: on(2) }),
    tx({ type: 'transfer', category_id: null, to_account_id: 2, amount_paise: 100_000, occurred_at: on(4) }),
    tx({ amount_paise: 70_000, occurred_at: on(2, 10) }),
  ];

  it('in, out and % saved leave out transfers, balance updates and deleted entries', () => {
    const s = monthStats(txs, '2026-09', on(10), new Set([rent.id]));
    expect(s.in_paise).toBe(3_000_000);
    expect(s.out_paise).toBe(882_000);
    expect(s.saved_paise).toBe(2_118_000);
    expect(s.saved_percent).toBe(71);
  });

  it('everyday stats skip bills; average counts days so far', () => {
    const s = monthStats(txs, '2026-09', on(10), new Set([rent.id]));
    expect(s.everyday_paise).toBe(82_000);
    expect(s.days_counted).toBe(10);
    expect(s.average_per_day_paise).toBe(8_200);
    expect(s.top_days).toEqual([{ day: 3, paise: 52_000 }, { day: 7, paise: 30_000 }]);
    expect(s.largest?.amount_paise).toBe(50_000);
  });

  it('a past month counts all its days; no income → no percent', () => {
    const s = monthStats(txs, '2026-10', on(5, 11));
    expect(s.days_counted).toBe(31);
    expect(s.saved_percent).toBeNull();
    expect(s.saved_paise).toBe(-70_000);
  });

  it('lists months with entries up to the current one', () => {
    expect(monthsWithEntries(txs, '2026-09')).toEqual(['2026-09']);
    expect(monthsWithEntries(txs, '2026-11')).toEqual(['2026-09', '2026-10', '2026-11']);
  });
});
