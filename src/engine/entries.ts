/**
 * How an entry reads in lists (title, sign) and History's search and
 * filters. Pure, so History stays a thin component.
 */
import { monthKey, type MonthKey } from './calendar';
import type { Debt } from './debts';
import type { Account, Category, EffectiveTransaction } from './types';

export type EntryKind = 'expense' | 'income' | 'transfer' | 'borrowed' | 'repaid' | 'lent' | 'got_back';

export function entryKind(tx: EffectiveTransaction, debt: Pick<Debt, 'kind'> | undefined): EntryKind {
  if (tx.type !== 'transfer') return tx.type;
  if (tx.debt_id == null) return 'transfer';
  if (debt?.kind === 'lent') return tx.direction === 'out' ? 'lent' : 'got_back';
  return tx.direction === 'in' ? 'borrowed' : 'repaid';
}

export interface EntryLabel {
  kind: EntryKind;
  title: string;
  /** '+' money came in, '−' shown plain, '' neither (a move between your accounts). */
  sign: '+' | '-' | '';
  /** Material Community Icons name for non-category entries. */
  icon: string | null;
}

export function entryLabel(
  tx: EffectiveTransaction,
  lookups: {
    categories: ReadonlyMap<number, Pick<Category, 'name' | 'icon'>>;
    accounts: ReadonlyMap<number, Pick<Account, 'name'>>;
    debts: ReadonlyMap<number, Pick<Debt, 'kind' | 'person'>>;
  },
): EntryLabel {
  const debt = tx.debt_id != null ? lookups.debts.get(tx.debt_id) : undefined;
  const kind = entryKind(tx, debt);
  const person = debt?.person ?? 'someone';
  const account = (id: number | null | undefined) => (id != null ? lookups.accounts.get(id)?.name : undefined) ?? 'account';
  switch (kind) {
    case 'transfer':
      return { kind, title: `${account(tx.account_id)} → ${account(tx.to_account_id)}`, sign: '', icon: 'swap-horizontal' };
    case 'borrowed':
      return { kind, title: `Borrowed from ${person}`, sign: '+', icon: 'hand-coin-outline' };
    case 'repaid':
      return { kind, title: `Repaid ${person}`, sign: '-', icon: 'cash-refund' };
    case 'lent':
      return { kind, title: `Lent to ${person}`, sign: '-', icon: 'hand-coin-outline' };
    case 'got_back':
      return { kind, title: `${person} paid back`, sign: '+', icon: 'cash-refund' };
    default: {
      const category = tx.category_id != null ? lookups.categories.get(tx.category_id) : undefined;
      return {
        kind,
        title: tx.note || category?.name || 'Uncategorised',
        sign: kind === 'income' ? '+' : '-',
        icon: null,
      };
    }
  }
}

export type TypeFilter = 'all' | 'expense' | 'income' | 'transfer' | 'people';

export interface HistoryFilter {
  query?: string;
  type?: TypeFilter;
  categoryId?: number | null;
  accountId?: number | null;
  month?: MonthKey | null;
}

/** Visible entries matching every filter that is set. Search looks at notes, categories, accounts and people. */
export function filterEntries(
  transactions: readonly EffectiveTransaction[],
  filter: HistoryFilter,
  lookups: Parameters<typeof entryLabel>[1],
): EffectiveTransaction[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return transactions.filter((t) => {
    if (t.voided) return false;
    if (filter.month && monthKey(t.occurred_at) !== filter.month) return false;
    if (filter.categoryId != null && t.category_id !== filter.categoryId) return false;
    if (filter.accountId != null && t.account_id !== filter.accountId && t.to_account_id !== filter.accountId) return false;
    const type = filter.type ?? 'all';
    if (type === 'expense' && t.type !== 'expense') return false;
    if (type === 'income' && t.type !== 'income') return false;
    if (type === 'transfer' && !(t.type === 'transfer' && t.debt_id == null)) return false;
    if (type === 'people' && t.debt_id == null) return false;
    if (q) {
      const label = entryLabel(t, lookups);
      const category = t.category_id != null ? lookups.categories.get(t.category_id)?.name : '';
      const haystack = [label.title, t.note, category, lookups.accounts.get(t.account_id)?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
