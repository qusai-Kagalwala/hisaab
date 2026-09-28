/**
 * App-wide ledger state. Loads rows from SQLite and derives everything else
 * (effective transactions, balances) through the engine. Components read from
 * here and call actions; they never do money math themselves.
 */
import { create } from 'zustand';
import {
  addAccount,
  addTransaction,
  correctTransaction,
  getSetting,
  listAccounts,
  listCategories,
  listTransactionRows,
  renameAccount,
  setSetting,
  SETTING_LAST_ACCOUNT,
  undoNewTransaction,
  type NewTransaction,
} from '../db/queries';
import type { Db } from '../db/types';
import { computeBalances, resolveTransactions, type CorrectionInput } from '../engine/ledger';
import type { Paise } from '../engine/money';
import type { Account, AccountType, Category, EffectiveTransaction } from '../engine/types';

interface LedgerState {
  loaded: boolean;
  accounts: Account[];
  categories: Category[];
  /** Newest first; includes voided entries (filter for display). */
  transactions: EffectiveTransaction[];
  balances: Map<number, Paise>;
  lastAccountId: number | null;

  load: (db: Db) => Promise<void>;
  saveTransaction: (db: Db, tx: NewTransaction) => Promise<number>;
  undoNew: (db: Db, id: number) => Promise<boolean>;
  correct: (db: Db, current: EffectiveTransaction, next: CorrectionInput) => Promise<number | null>;
  setLastAccount: (db: Db, id: number) => Promise<void>;
  addAccount: (db: Db, name: string, type: AccountType) => Promise<number>;
  renameAccount: (db: Db, id: number, name: string) => Promise<void>;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  loaded: false,
  accounts: [],
  categories: [],
  transactions: [],
  balances: new Map(),
  lastAccountId: null,

  load: async (db) => {
    const [accounts, categories, rows, lastRaw] = await Promise.all([
      listAccounts(db),
      listCategories(db),
      listTransactionRows(db),
      getSetting(db, SETTING_LAST_ACCOUNT),
    ]);
    const transactions = resolveTransactions(rows);
    const balances = computeBalances(accounts.map((a) => a.id), transactions);
    const last = lastRaw == null ? null : Number(lastRaw);
    const lastAccountId = accounts.some((a) => a.id === last) ? last : accounts[0]?.id ?? null;
    set({ loaded: true, accounts, categories, transactions, balances, lastAccountId });
  },

  saveTransaction: async (db, tx) => {
    const id = await addTransaction(db, tx);
    await setSetting(db, SETTING_LAST_ACCOUNT, String(tx.account_id));
    await get().load(db);
    return id;
  },

  undoNew: async (db, id) => {
    const removed = await undoNewTransaction(db, id);
    await get().load(db);
    return removed;
  },

  correct: async (db, current, next) => {
    const id = await correctTransaction(db, current, next);
    await get().load(db);
    return id;
  },

  setLastAccount: async (db, id) => {
    set({ lastAccountId: id });
    await setSetting(db, SETTING_LAST_ACCOUNT, String(id));
  },

  addAccount: async (db, name, type) => {
    const id = await addAccount(db, name, type);
    await get().load(db);
    return id;
  },

  renameAccount: async (db, id, name) => {
    await renameAccount(db, id, name);
    await get().load(db);
  },
}));
