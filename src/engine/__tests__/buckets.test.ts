import {
  BUCKET_TEMPLATES,
  bucketForCategory,
  computeMoneyPicture,
  explainSafeToSpend,
  coverCandidates,
  coverOverspend,
  moveBetweenBuckets,
  percentOf,
  safeToSpend,
  splitByPercent,
  type Bucket,
  type MoneyPicture,
} from '../buckets';
import { CATEGORY_ID } from '../defaults';
import { resolveTransactions } from '../ledger';
import { addPaise } from '../money';
import type { TransactionRow } from '../types';

function bucket(partial: Partial<Bucket> & { id: number }): Bucket {
  return {
    name: `B${partial.id}`, period_month: '2026-09', allocated_paise: 0, role: null,
    sort_order: partial.id, category_ids: [], ...partial,
  };
}

let txId = 1;
function tx(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: txId++, account_id: 1, category_id: 1, bucket_id: null, amount_paise: 1_000, type: 'expense',
    note: null, created_at: new Date(2026, 8, 10).getTime(), corrects_id: null, ...partial,
  };
}

function checkInvariant(p: MoneyPicture) {
  const inBuckets = addPaise(...p.buckets.map((b) => b.remaining_paise));
  expect(inBuckets + p.reserved_paise + p.repayments_paise + p.goals_paise + p.unallocated_paise).toBe(p.total_paise);
}

describe('computeMoneyPicture', () => {
  it('derives remaining, unallocated and the plan pool', () => {
    const buckets = [
      bucket({ id: 1, name: 'Entertainment', allocated_paise: 300_000 }),
      bucket({ id: 2, name: 'Flexible', role: 'flexible', allocated_paise: 100_000 }),
    ];
    const rows = [
      tx({ bucket_id: 1, amount_paise: 45_000 }),
      tx({ bucket_id: null, amount_paise: 5_000 }), // before buckets existed
      tx({ bucket_id: 1, type: 'income', amount_paise: 1 }), // income never draws a bucket
    ];
    const voided = tx({ bucket_id: 1, amount_paise: 99_000 });
    rows.push(voided, tx({ type: 'correction', corrects_id: voided.id, amount_paise: 0, bucket_id: 1 }));

    const p = computeMoneyPicture({
      balances: new Map([[1, 2_000_000], [2, 1_000_000]]),
      buckets,
      transactions: resolveTransactions(rows),
      reserved_paise: 800_000,
    });
    expect(p.total_paise).toBe(3_000_000);
    expect(p.buckets[0]).toMatchObject({ spent_paise: 45_000, remaining_paise: 255_000 });
    expect(p.in_buckets_paise).toBe(355_000);
    expect(p.unallocated_paise).toBe(3_000_000 - 800_000 - 355_000);
    expect(p.plan_pool_paise).toBe(400_000 + p.unallocated_paise);
    checkInvariant(p);
  });

  it('works with no buckets and no accounts', () => {
    const p = computeMoneyPicture({ balances: new Map(), buckets: [], transactions: [], reserved_paise: 0 });
    expect(p).toMatchObject({ total_paise: 0, unallocated_paise: 0, plan_pool_paise: 0 });
  });

  it('keeps the invariant over random ledgers, moves and covers', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      txId = 1;
      let buckets = [1, 2, 3, 4].map((id) =>
        bucket({ id, allocated_paise: rand(500_000), role: id === 4 ? 'flexible' : null }));
      const rows: TransactionRow[] = [];
      for (let i = 0; i < 30; i++) {
        const type = rand(4) === 0 ? 'income' : 'expense';
        rows.push(tx({ type, account_id: 1 + rand(2), amount_paise: 1 + rand(300_000), bucket_id: type === 'expense' && rand(3) ? 1 + rand(4) : null }));
      }
      const txs = resolveTransactions(rows);
      const balances = new Map<number, number>([[1, 0], [2, 0]]);
      for (const t of txs) balances.set(t.account_id, balances.get(t.account_id)! + (t.type === 'income' ? t.amount_paise : -t.amount_paise));
      const reserved = rand(200_000);
      const goals = rand(300_000);
      const repayments = rand(150_000);
      const picture = () =>
        computeMoneyPicture({ balances, buckets, transactions: txs, reserved_paise: reserved, repayments_paise: repayments, goals_paise: goals });

      const before = picture();
      checkInvariant(before);

      // A move or cover must leave unallocated and the total unchanged.
      const from = before.buckets.find((b) => b.remaining_paise > 0);
      const to = before.buckets.find((b) => b.id !== from?.id);
      if (from && to) {
        const amount = 1 + rand(from.remaining_paise);
        const changes = moveBetweenBuckets(before.buckets, from.id, to.id, amount);
        buckets = buckets.map((b) => ({ ...b, allocated_paise: changes.find((c) => c.id === b.id)?.allocated_paise ?? b.allocated_paise }));
        const after = picture();
        checkInvariant(after);
        expect(after.unallocated_paise).toBe(before.unallocated_paise);
      }
      // The Home explanation always adds up to exactly the safe-to-spend pool.
      const nowMs = new Date(2026, 8, 20).getTime();
      expect(explainSafeToSpend(picture(), nowMs).pool_paise).toBe(safeToSpend(picture(), nowMs).pool_paise);
      const now = picture();
      const over = now.buckets.find((b) => b.remaining_paise < 0);
      const source = over && coverCandidates(now.buckets, over.id)[0];
      if (over && source) {
        const { changes } = coverOverspend(now.buckets, over.id, source.id);
        buckets = buckets.map((b) => ({ ...b, allocated_paise: changes.find((c) => c.id === b.id)?.allocated_paise ?? b.allocated_paise }));
        const after = picture();
        checkInvariant(after);
        expect(after.unallocated_paise).toBe(now.unallocated_paise);
      }
    }
  });
});

describe('safeToSpend', () => {
  const base = { total_paise: 0, reserved_paise: 0, repayments_paise: 0, goals_paise: 0, in_buckets_paise: 0, plan_pool_paise: 0 };
  const flexible = { ...bucket({ id: 1, role: 'flexible' }), spent_paise: 0, remaining_paise: 100_000 };
  const lastWeek = new Date(2026, 8, 24).getTime(); // 7 days left in September

  it('divides flexible + unallocated by days left, rounding down', () => {
    const s = safeToSpend({ ...base, buckets: [flexible], unallocated_paise: 1 }, lastWeek);
    expect(s).toEqual({ per_day_paise: Math.floor(100_001 / 7), pool_paise: 100_001, days_left: 7, over_paise: 0 });
  });

  it('uses unallocated alone when there are no buckets', () => {
    expect(safeToSpend({ ...base, buckets: [], unallocated_paise: 70_000 }, lastWeek).per_day_paise).toBe(10_000);
  });

  it('never goes negative and reports how far over', () => {
    const s = safeToSpend({ ...base, buckets: [flexible], unallocated_paise: -150_000 }, lastWeek);
    expect(s).toMatchObject({ per_day_paise: 0, over_paise: 50_000 });
  });

  it('subtracts overspends nobody covered', () => {
    const over = { ...bucket({ id: 3 }), spent_paise: 45_000, remaining_paise: -45_000 };
    expect(safeToSpend({ ...base, buckets: [flexible, over], unallocated_paise: 15_000 }, lastWeek).pool_paise).toBe(70_000);
  });

  it('ignores savings and other buckets', () => {
    const savings = { ...bucket({ id: 2, role: 'savings' }), spent_paise: 0, remaining_paise: 900_000 };
    expect(safeToSpend({ ...base, buckets: [savings], unallocated_paise: 0 }, lastWeek).per_day_paise).toBe(0);
  });
});

describe('splitByPercent', () => {
  it('sums exactly to the total at 100%', () => {
    for (const total of [0, 1, 99, 100_001, 3_000_000, 1_234_567]) {
      const parts = splitByPercent(total, [30, 20, 20, 10, 10, 10]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p) => expect(Number.isInteger(p)).toBe(true));
    }
    expect(splitByPercent(100, [33, 33, 34])).toEqual([33, 33, 34]);
    expect(splitByPercent(1, [50, 50])).toEqual([1, 0]);
  });

  it('rounds down below 100% and leaves the rest', () => {
    expect(splitByPercent(1_001, [50, 25])).toEqual([500, 250]);
  });

  it('rejects bad input', () => {
    expect(() => splitByPercent(100, [60, 50])).toThrow();
    expect(() => splitByPercent(100, [10.5])).toThrow();
    expect(() => splitByPercent(-1, [100])).toThrow();
  });

  it('shows percentages for display', () => {
    expect(percentOf(255_000, 300_000)).toBe(85);
    expect(percentOf(1, 0)).toBe(0);
  });
});

describe('bucketForCategory', () => {
  const buckets = [
    bucket({ id: 1, category_ids: [CATEGORY_ID.entertainment] }),
    bucket({ id: 2, role: 'flexible' }),
  ];
  it('uses the mapped bucket, else Flexible, else none', () => {
    expect(bucketForCategory(buckets, CATEGORY_ID.entertainment)).toBe(1);
    expect(bucketForCategory(buckets, CATEGORY_ID.rent)).toBe(2);
    expect(bucketForCategory([], CATEGORY_ID.rent)).toBeNull();
  });
});

describe('moves and covers', () => {
  const statuses = [
    { ...bucket({ id: 1, allocated_paise: 300_000 }), spent_paise: 345_000, remaining_paise: -45_000 },
    { ...bucket({ id: 2, role: 'flexible', allocated_paise: 100_000 }), spent_paise: 80_000, remaining_paise: 20_000 },
    { ...bucket({ id: 3, allocated_paise: 50_000 }), spent_paise: 0, remaining_paise: 50_000 },
  ];

  it('only moves what is left', () => {
    expect(moveBetweenBuckets(statuses, 3, 1, 50_000)).toEqual([
      { id: 3, allocated_paise: 0 },
      { id: 1, allocated_paise: 350_000 },
    ]);
    expect(() => moveBetweenBuckets(statuses, 3, 1, 50_001)).toThrow();
    expect(() => moveBetweenBuckets(statuses, 1, 2, 1)).toThrow();
    expect(() => moveBetweenBuckets(statuses, 2, 2, 1)).toThrow();
    expect(() => moveBetweenBuckets(statuses, 2, 1, 0)).toThrow();
  });

  it('covers as much of an overspend as the source has, Flexible first', () => {
    expect(coverCandidates(statuses, 1).map((b) => b.id)).toEqual([2, 3]);
    expect(coverOverspend(statuses, 1, 2).amount_paise).toBe(20_000);
    expect(coverOverspend(statuses, 1, 3).amount_paise).toBe(45_000);
  });
});

describe('templates', () => {
  it('add up to 100% (Custom starts at 0) and have exactly one Flexible', () => {
    for (const t of BUCKET_TEMPLATES) {
      const sum = t.buckets.reduce((a, b) => a + b.percent, 0);
      expect(t.id === 'custom' ? sum === 0 : sum === 100).toBe(true);
      expect(t.buckets.filter((b) => b.role === 'flexible')).toHaveLength(1);
      const cats = t.buckets.flatMap((b) => b.category_ids);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });
});

describe('explainSafeToSpend', () => {
  it('shows the steps that lead to the daily number', () => {
    const flexible = { ...bucket({ id: 1, role: 'flexible' as const, allocated_paise: 100_000 }), spent_paise: 0, remaining_paise: 100_000 };
    const savings = { ...bucket({ id: 2, role: 'savings' as const, allocated_paise: 500_000 }), spent_paise: 0, remaining_paise: 500_000 };
    const fun = { ...bucket({ id: 3, allocated_paise: 50_000 }), spent_paise: 70_000, remaining_paise: -20_000 };
    const picture: MoneyPicture = {
      total_paise: 3_452_000, reserved_paise: 800_000, repayments_paise: 0, goals_paise: 500_000,
      buckets: [flexible, savings, fun], in_buckets_paise: 580_000, unallocated_paise: 3_452_000 - 800_000 - 500_000 - 580_000, plan_pool_paise: 0,
    };
    const e = explainSafeToSpend(picture, new Date(2026, 8, 28).getTime());
    expect(e.steps.map((s) => [s.op, s.paise])).toEqual([
      ['start', 3_452_000], ['minus', 800_000], ['minus', 500_000], ['minus', 500_000], ['equals', 1_652_000],
    ]);
    expect(e).toMatchObject({ days_left: 3, per_day_paise: Math.floor(1_652_000 / 3) });
  });
});
