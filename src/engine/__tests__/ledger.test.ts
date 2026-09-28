import { balanceAdjustment, buildCorrection, computeBalances, groupByDay, resolveTransactions, signedAmount } from '../ledger';
import type { TransactionRow } from '../types';

let nextId = 1;
function row(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: nextId++,
    account_id: 1,
    category_id: 1,
    bucket_id: null,
    amount_paise: 1_000,
    type: 'expense',
    note: null,
    created_at: new Date(2026, 8, 28, 10, 0).getTime(),
    corrects_id: null,
    ...partial,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('resolveTransactions', () => {
  it('returns originals unchanged when there are no corrections', () => {
    const a = row({ amount_paise: 4_000 });
    const [tx] = resolveTransactions([a]);
    expect(tx).toMatchObject({ id: a.id, amount_paise: 4_000, corrected_by: null, voided: false });
  });

  it('applies the latest correction by id, keeping the original time', () => {
    const original = row({ amount_paise: 4_000, created_at: 1_000 });
    const c1 = row({ type: 'correction', corrects_id: original.id, amount_paise: 5_000, created_at: 9_000 });
    const c2 = row({ type: 'correction', corrects_id: original.id, amount_paise: 6_000, created_at: 5_000 });
    const [tx] = resolveTransactions([c2, original, c1]);
    expect(tx).toMatchObject({ id: original.id, amount_paise: 6_000, occurred_at: 1_000, corrected_by: c2.id, type: 'expense' });
  });

  it('marks zero-amount corrections as voided', () => {
    const original = row({});
    const del = row({ type: 'correction', corrects_id: original.id, amount_paise: 0 });
    expect(resolveTransactions([original, del])[0].voided).toBe(true);
  });

  it('rejects malformed rows', () => {
    expect(() => resolveTransactions([row({ type: 'correction', corrects_id: 99 })])).toThrow(/missing/);
    expect(() => resolveTransactions([row({ type: 'correction' })])).toThrow();
    expect(() => resolveTransactions([row({ amount_paise: -1 })])).toThrow();
    expect(() => resolveTransactions([row({ amount_paise: 1.5 })])).toThrow();
  });

  it('sorts newest first', () => {
    const older = row({ created_at: 1_000 });
    const newer = row({ created_at: 2_000 });
    expect(resolveTransactions([older, newer]).map((t) => t.id)).toEqual([newer.id, older.id]);
  });
});

describe('computeBalances', () => {
  it('sums income minus expenses per account, ignoring voided entries', () => {
    const rows = [
      row({ account_id: 1, type: 'income', amount_paise: 100_000 }),
      row({ account_id: 1, amount_paise: 4_000 }),
      row({ account_id: 2, amount_paise: 2_550 }),
    ];
    const voidMe = row({ account_id: 1, amount_paise: 50_000 });
    rows.push(voidMe, row({ type: 'correction', corrects_id: voidMe.id, amount_paise: 0 }));
    const balances = computeBalances([1, 2, 3], resolveTransactions(rows));
    expect(balances.get(1)).toBe(96_000);
    expect(balances.get(2)).toBe(-2_550);
    expect(balances.get(3)).toBe(0);
  });

  it('moves the effect when a correction changes the account', () => {
    const original = row({ account_id: 1, amount_paise: 1_000 });
    const moved = row({ type: 'correction', corrects_id: original.id, account_id: 2, amount_paise: 1_000 });
    const balances = computeBalances([1, 2], resolveTransactions([original, moved]));
    expect(balances.get(1)).toBe(0);
    expect(balances.get(2)).toBe(-1_000);
  });

  it('refuses transfers until they are modelled', () => {
    expect(() => signedAmount({ type: 'transfer', amount_paise: 1 })).toThrow();
  });
});

describe('buildCorrection', () => {
  const [current] = resolveTransactions([row({ note: 'chai' })]);

  it('returns null when nothing changed (note whitespace ignored)', () => {
    expect(buildCorrection(current, { account_id: 1, category_id: 1, amount_paise: 1_000, note: ' chai ' })).toBeNull();
  });

  it('returns full replacement values pointing at the original', () => {
    expect(buildCorrection(current, { account_id: 2, category_id: 1, amount_paise: 1_000, note: '' })).toEqual({
      corrects_id: current.id,
      account_id: 2,
      category_id: 1,
      bucket_id: null,
      amount_paise: 1_000,
      note: null,
    });
  });

  it('rejects invalid amounts', () => {
    expect(() => buildCorrection(current, { account_id: 1, category_id: 1, amount_paise: -1, note: null })).toThrow();
    expect(() => buildCorrection(current, { account_id: 1, category_id: 1, amount_paise: 0.5, note: null })).toThrow();
  });
});

describe('groupByDay', () => {
  it('groups by local day, skips voided, sums expenses only', () => {
    const day1 = new Date(2026, 8, 27, 9, 0).getTime();
    const day2 = new Date(2026, 8, 28, 9, 0).getTime();
    const rows = [
      row({ created_at: day1, amount_paise: 2_000 }),
      row({ created_at: day2, amount_paise: 4_000 }),
      row({ created_at: day2 + 3_600_000, amount_paise: 1_500 }),
      row({ created_at: day2, type: 'income', amount_paise: 99_900 }),
    ];
    const voided = row({ created_at: day2, amount_paise: 7_000 });
    rows.push(voided, row({ type: 'correction', corrects_id: voided.id, amount_paise: 0 }));

    const groups = groupByDay(resolveTransactions(rows));
    expect(groups.map((g) => g.key)).toEqual(['2026-09-28', '2026-09-27']);
    expect(groups[0].transactions).toHaveLength(3);
    expect(groups[0].spent).toBe(5_500);
    expect(groups[1].spent).toBe(2_000);
  });
});

describe('balanceAdjustment', () => {
  it('logs only the difference', () => {
    expect(balanceAdjustment(-4_000, 50_000)).toEqual({ type: 'income', amount_paise: 54_000 });
    expect(balanceAdjustment(50_000, 20_000)).toEqual({ type: 'expense', amount_paise: 30_000 });
    expect(balanceAdjustment(1_000, 1_000)).toBeNull();
  });
});

describe('buildCorrection bucket', () => {
  it('keeps the bucket unless one is given', () => {
    const [current] = resolveTransactions([row({ bucket_id: 3 })]);
    const base = { account_id: 1, category_id: 1, amount_paise: 1_000, note: null };
    expect(buildCorrection(current, base)).toBeNull();
    expect(buildCorrection(current, { ...base, bucket_id: 4 })?.bucket_id).toBe(4);
    expect(buildCorrection(current, { ...base, bucket_id: null })?.bucket_id).toBeNull();
  });
});
