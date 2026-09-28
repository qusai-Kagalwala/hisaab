import { CATEGORY_ID as C } from '../defaults';
import { resolveTransactions } from '../ledger';
import { lastEntry, quickPicks } from '../quickPicks';
import type { TransactionRow } from '../types';

let id = 1;
const now = new Date(2026, 8, 28, 12).getTime();
const tx = (p: Partial<TransactionRow>): TransactionRow => ({
  id: id++, account_id: 1, category_id: C.chai, bucket_id: null, amount_paise: 2_000, type: 'expense',
  note: null, created_at: now - 3_600_000, corrects_id: null, ...p,
});

describe('quickPicks', () => {
  it('ranks repeated (category, amount) pairs from the last 30 days', () => {
    const rows = [
      tx({}), tx({}), tx({}),
      tx({ category_id: C.transport, amount_paise: 5_000 }), tx({ category_id: C.transport, amount_paise: 5_000, account_id: 2 }),
      tx({ category_id: C.food, amount_paise: 12_000 }), // only once
      tx({ category_id: C.rent, amount_paise: 800_000, created_at: now - 40 * 86_400_000 }),
      tx({ category_id: C.rent, amount_paise: 800_000, created_at: now - 45 * 86_400_000 }),
      tx({ category_id: 17, amount_paise: 1 }), tx({ category_id: 17, amount_paise: 1 }),
    ];
    const picks = quickPicks(resolveTransactions(rows), now);
    expect(picks.map((p) => [p.category_id, p.amount_paise, p.count])).toEqual([[C.chai, 2_000, 3], [C.transport, 5_000, 2]]);
  });

  it('repeat-last skips voided entries, balance updates and bills', () => {
    const a = tx({ amount_paise: 1_111, created_at: now - 10_000 });
    const voided = tx({ created_at: now - 5_000 });
    const rows = [a, voided, tx({ type: 'correction', corrects_id: voided.id, amount_paise: 0 }), tx({ category_id: 17, created_at: now - 1_000 }), tx({ id: 999, created_at: now })];
    expect(lastEntry(resolveTransactions(rows), new Set([999]))?.amount_paise).toBe(1_111);
    expect(lastEntry([])).toBeNull();
  });
});
