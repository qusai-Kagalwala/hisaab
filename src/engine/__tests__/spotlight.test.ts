import { computeBalances, resolveTransactions, buildCorrection } from '../ledger';
import {
  canTakeFromSavings,
  inScope,
  isSavingsTransfer,
  monthMoves,
  resolveSpotlight,
  savingsFromTransfers,
  scopeBalances,
  scopeByAccount,
  scopeTransactions,
} from '../spotlight';
import { computeMoneyPicture, moneyAddsUp } from '../buckets';
import { monthStats } from '../charts';
import { transactionsCsv } from '../csv';
import { entryLabel } from '../entries';
import type { EffectiveTransaction, TransactionRow } from '../types';

let id = 1;
function tx(partial: Partial<EffectiveTransaction>): EffectiveTransaction {
  return {
    id: id++, type: 'expense', account_id: 1, category_id: 1, bucket_id: null, amount_paise: 1_000, note: null,
    occurred_at: new Date(2026, 9, 10, 12).getTime(), corrected_by: null, voided: false,
    to_account_id: null, debt_id: null, direction: null, ...partial,
  };
}
const row = (p: Partial<TransactionRow>): TransactionRow => ({
  id: id++, account_id: 1, category_id: null, bucket_id: null, amount_paise: 1_000, type: 'transfer', note: null,
  created_at: 1, corrects_id: null, to_account_id: null, debt_id: null, direction: null, ...p,
});

// Accounts: 1 = SBI (spotlight), 2 = Cash, 3 = second bank.
const SBI = 1;
const CASH = 2;
const toSavings = (account: number, amount: number) =>
  tx({ type: 'transfer', category_id: null, account_id: account, amount_paise: amount, direction: 'out' });
const fromSavings = (account: number, amount: number) =>
  tx({ type: 'transfer', category_id: null, account_id: account, amount_paise: amount, direction: 'in' });

describe('Savings transfers in the ledger', () => {
  it('are a valid transfer shape and lower the account they leave', () => {
    const rows = [
      row({ type: 'income', category_id: 13, amount_paise: 50_000_00 }),
      row({ amount_paise: 10_000_00, direction: 'out' }),
      row({ amount_paise: 2_000_00, direction: 'in' }),
    ];
    const list = resolveTransactions(rows);
    expect(computeBalances([1], list).get(1)).toBe(42_000_00);
    expect(savingsFromTransfers(list)).toBe(8_000_00);
  });

  it('can be corrected (amount, account) and keep being Savings', () => {
    const original = row({ amount_paise: 5_000_00, direction: 'out' });
    const [current] = resolveTransactions([original]);
    const c = buildCorrection(current, { account_id: 2, category_id: null, amount_paise: 4_000_00, note: null })!;
    expect(c.direction).toBe('out');
    expect(c.to_account_id).toBeNull();
    const [after] = resolveTransactions([original, { ...row({}), ...c, type: 'correction', id: id++ }]);
    expect(isSavingsTransfer(after)).toBe(true);
    expect(after.account_id).toBe(2);
    expect(savingsFromTransfers([after])).toBe(4_000_00);
  });

  it('still rejects a transfer with no destination at all', () => {
    expect(() => resolveTransactions([row({})])).toThrow('destination account, a person or Savings');
  });
});

describe('isSavingsTransfer', () => {
  it('tells Savings apart from account moves and borrow & lend', () => {
    expect(isSavingsTransfer(toSavings(SBI, 100))).toBe(true);
    expect(isSavingsTransfer(tx({ type: 'transfer', to_account_id: 2 }))).toBe(false);
    expect(isSavingsTransfer(tx({ type: 'transfer', debt_id: 4, direction: 'out' }))).toBe(false);
    expect(isSavingsTransfer(tx({ type: 'expense' }))).toBe(false);
  });
});

describe('savingsFromTransfers', () => {
  it('ignores deleted entries', () => {
    expect(savingsFromTransfers([toSavings(SBI, 500), { ...toSavings(SBI, 900), voided: true }])).toBe(500);
  });
});

describe('resolveSpotlight', () => {
  const accounts = [{ id: 1 }, { id: 2 }, { id: 3, archived: true }];
  it('returns the chosen account while it is in use', () => {
    expect(resolveSpotlight('2', accounts)).toBe(2);
  });
  it('falls back to all accounts when unset, unknown or removed', () => {
    expect(resolveSpotlight(null, accounts)).toBeNull();
    expect(resolveSpotlight('', accounts)).toBeNull();
    expect(resolveSpotlight('9', accounts)).toBeNull();
    expect(resolveSpotlight('3', accounts)).toBeNull();
  });
});

describe('scoping', () => {
  const list = [
    tx({ account_id: SBI }),
    tx({ account_id: CASH }),
    tx({ type: 'transfer', account_id: CASH, to_account_id: SBI }),
    tx({ type: 'transfer', account_id: 3, to_account_id: CASH }),
  ];
  it('keeps entries that touch the spotlight account', () => {
    expect(scopeTransactions(list, SBI).map((t) => t.account_id)).toEqual([SBI, CASH]);
    expect(inScope(list[2], SBI)).toBe(true);
    expect(inScope(list[3], SBI)).toBe(false);
  });
  it('keeps everything with no spotlight', () => {
    expect(scopeTransactions(list, null)).toHaveLength(4);
  });
  it('counts only the spotlight balance', () => {
    const balances = new Map([[SBI, 5_000], [CASH, 900]]);
    expect([...scopeBalances(balances, SBI)]).toEqual([[SBI, 5_000]]);
    expect(scopeBalances(balances, null).size).toBe(2);
    expect(scopeBalances(new Map(), SBI).get(SBI)).toBe(0);
  });
  it('keeps bills on the spotlight account only', () => {
    const bills = [{ account_id: SBI, n: 'rent' }, { account_id: CASH, n: 'milk' }];
    expect(scopeByAccount(bills, SBI).map((b) => b.n)).toEqual(['rent']);
    expect(scopeByAccount(bills, null)).toHaveLength(2);
  });
});

describe('monthMoves', () => {
  const month = '2026-10';
  const list = [
    tx({ type: 'transfer', account_id: CASH, to_account_id: SBI, amount_paise: 3_000 }),
    tx({ type: 'transfer', account_id: SBI, to_account_id: CASH, amount_paise: 1_000 }),
    toSavings(SBI, 10_000),
    fromSavings(SBI, 2_000),
    toSavings(CASH, 500),
    tx({ type: 'transfer', account_id: CASH, to_account_id: SBI, amount_paise: 7_000, occurred_at: new Date(2026, 8, 1).getTime() }),
  ];
  it('reports moves in, out and Savings for the spotlight account', () => {
    expect(monthMoves(list, SBI, month)).toEqual({ moved_in_paise: 3_000, moved_out_paise: 1_000, to_savings_paise: 8_000 });
  });
  it('with no spotlight, only Savings (own moves cancel out)', () => {
    expect(monthMoves(list, null, month)).toEqual({ moved_in_paise: 0, moved_out_paise: 0, to_savings_paise: 8_500 });
  });
});

describe('canTakeFromSavings', () => {
  it('never lets Savings go below zero', () => {
    expect(canTakeFromSavings(1_000, 1_000)).toBe(true);
    expect(canTakeFromSavings(1_000, 1_001)).toBe(false);
    expect(canTakeFromSavings(1_000, 0)).toBe(false);
  });
});

describe('spotlight end to end', () => {
  // Salary into SBI, rent from SBI, cash spending, a second bank, and Savings.
  const list = [
    tx({ type: 'income', category_id: 13, account_id: SBI, amount_paise: 30_000_00 }),
    toSavings(SBI, 10_000_00),
    tx({ account_id: SBI, amount_paise: 500_00 }),
    tx({ account_id: CASH, amount_paise: 200_00 }),
    tx({ type: 'income', category_id: 13, account_id: 3, amount_paise: 60_000_00 }),
  ];
  const balances = computeBalances([SBI, CASH, 3], list);

  it('money picture counts the spotlight account only and still adds up', () => {
    const picture = computeMoneyPicture({
      balances: scopeBalances(balances, SBI), buckets: [], transactions: scopeTransactions(list, SBI),
      reserved_paise: 0, repayments_paise: 0, savings_paise: 0, goals_paise: 0,
    });
    expect(picture.total_paise).toBe(19_500_00);
    expect(moneyAddsUp(picture)).toBe(true);
  });

  it('month stats count spotlight spending and income only; Savings is not spending', () => {
    const stats = monthStats(scopeTransactions(list, SBI), '2026-10', new Date(2026, 9, 20).getTime());
    expect(stats.in_paise).toBe(30_000_00);
    expect(stats.out_paise).toBe(500_00);
  });
});

describe('Savings entries in History and CSV', () => {
  const lookups = { categories: new Map(), accounts: new Map([[SBI, { name: 'SBI' }]]), debts: new Map() };

  it('reads as "SBI → Savings" and back, neither income nor spending', () => {
    expect(entryLabel(toSavings(SBI, 100), lookups)).toMatchObject({ kind: 'to_savings', title: 'SBI → Savings', sign: '' });
    expect(entryLabel(fromSavings(SBI, 100), lookups)).toMatchObject({ kind: 'from_savings', title: 'Savings → SBI', sign: '' });
  });

  it('exports as To Savings / From Savings', () => {
    const csv = transactionsCsv([toSavings(SBI, 500_00), fromSavings(SBI, 100_00)], [{ id: SBI, name: 'SBI' }], [], new Map());
    expect(csv).toContain('To Savings,500.00,,SBI,Savings');
    expect(csv).toContain('From Savings,100.00,,SBI,Savings');
  });
});
