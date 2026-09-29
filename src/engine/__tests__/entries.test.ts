import { entryLabel, filterEntries } from '../entries';
import type { EffectiveTransaction } from '../types';

let id = 1;
function tx(partial: Partial<EffectiveTransaction>): EffectiveTransaction {
  return {
    id: id++, type: 'expense', account_id: 1, category_id: 2, bucket_id: null, amount_paise: 2_000, note: null,
    occurred_at: new Date(2026, 8, 10, 9).getTime(), corrected_by: null, voided: false, ...partial,
  };
}

const lookups = {
  categories: new Map([[2, { name: 'Chai & Snacks', icon: 'coffee' }], [13, { name: 'Salary', icon: 'briefcase' }]]),
  accounts: new Map([[1, { name: 'Cash' }], [2, { name: 'UPI / Bank' }]]),
  debts: new Map([[5, { kind: 'borrowed' as const, person: 'Rahul' }], [6, { kind: 'lent' as const, person: 'Aman' }]]),
};

const chai = tx({ note: 'adrak chai' });
const salary = tx({ type: 'income', category_id: 13, account_id: 2, occurred_at: new Date(2026, 7, 1).getTime() });
const atm = tx({ type: 'transfer', category_id: null, account_id: 2, to_account_id: 1 });
const borrowed = tx({ type: 'transfer', category_id: null, debt_id: 5, direction: 'in' });
const repaid = tx({ type: 'transfer', category_id: null, debt_id: 5, direction: 'out' });
const lent = tx({ type: 'transfer', category_id: null, debt_id: 6, direction: 'out' });
const back = tx({ type: 'transfer', category_id: null, debt_id: 6, direction: 'in' });
const gone = tx({ voided: true, note: 'adrak' });
const all = [chai, salary, atm, borrowed, repaid, lent, back, gone];

describe('entryLabel', () => {
  it('names every kind of entry', () => {
    expect(all.slice(0, 7).map((t) => [entryLabel(t, lookups).title, entryLabel(t, lookups).sign])).toEqual([
      ['adrak chai', '-'],
      ['Salary', '+'],
      ['UPI / Bank → Cash', ''],
      ['Borrowed from Rahul', '+'],
      ['Repaid Rahul', '-'],
      ['Lent to Aman', '-'],
      ['Aman paid back', '+'],
    ]);
  });
});

describe('filterEntries', () => {
  const ids = (xs: EffectiveTransaction[]) => xs.map((t) => t.id);

  it('hides deleted entries and searches notes, categories, accounts and people', () => {
    expect(ids(filterEntries(all, {}, lookups))).toHaveLength(7);
    expect(ids(filterEntries(all, { query: 'ADRAK' }, lookups))).toEqual([chai.id]);
    expect(ids(filterEntries(all, { query: 'rahul' }, lookups))).toEqual([borrowed.id, repaid.id]);
    expect(ids(filterEntries(all, { query: 'snacks' }, lookups))).toEqual([chai.id]);
  });

  it('filters by type, category, account and month', () => {
    expect(ids(filterEntries(all, { type: 'income' }, lookups))).toEqual([salary.id]);
    expect(ids(filterEntries(all, { type: 'transfer' }, lookups))).toEqual([atm.id]);
    expect(ids(filterEntries(all, { type: 'people' }, lookups))).toEqual([borrowed.id, repaid.id, lent.id, back.id]);
    expect(ids(filterEntries(all, { categoryId: 2 }, lookups))).toEqual([chai.id]);
    expect(ids(filterEntries(all, { accountId: 2 }, lookups))).toEqual([salary.id, atm.id]);
    expect(ids(filterEntries(all, { month: '2026-08' }, lookups))).toEqual([salary.id]);
  });
});
