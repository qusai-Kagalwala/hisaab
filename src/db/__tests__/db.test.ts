import { CATEGORY_ID, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../../engine/defaults';
import { computeBalances, resolveTransactions } from '../../engine/ledger';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrations';
import {
  addAccount,
  addTransaction,
  correctTransaction,
  getSetting,
  listAccounts,
  listCategories,
  listTransactionRows,
  setSetting,
  undoNewTransaction,
} from '../queries';
import type { Db } from '../types';
import { createTestDb } from './nodeSqliteDb';

const CASH = DEFAULT_ACCOUNTS[0].id;
const UPI = DEFAULT_ACCOUNTS[1].id;

async function freshDb(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}

async function effective(db: Db) {
  return resolveTransactions(await listTransactionRows(db));
}

describe('migrations', () => {
  it('creates the schema and seeds defaults', async () => {
    const db = await freshDb();
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(LATEST_SCHEMA_VERSION);
    expect(await listAccounts(db)).toHaveLength(DEFAULT_ACCOUNTS.length);
    const categories = await listCategories(db);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(categories.find((c) => c.id === CATEGORY_ID.chai)?.keywords).toContain('chai');
  });

  it('is idempotent', async () => {
    const db = await freshDb();
    await migrate(db);
    expect(await listAccounts(db)).toHaveLength(DEFAULT_ACCOUNTS.length);
  });
});

describe('transactions', () => {
  it('stores paise and computes balances', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: UPI, category_id: CATEGORY_ID.salary, amount_paise: 3_000_000 });
    await addTransaction(db, { type: 'expense', account_id: CASH, category_id: CATEGORY_ID.chai, amount_paise: 4_000 });
    await addTransaction(db, { type: 'expense', account_id: UPI, category_id: CATEGORY_ID.food, amount_paise: 12_550 });
    const balances = computeBalances([CASH, UPI], await effective(db));
    expect(balances.get(CASH)).toBe(-4_000);
    expect(balances.get(UPI)).toBe(2_987_450);
  });

  it('rejects zero, negative and fractional amounts', async () => {
    const db = await freshDb();
    const base = { type: 'expense' as const, account_id: CASH, category_id: null };
    await expect(addTransaction(db, { ...base, amount_paise: 0 })).rejects.toThrow();
    await expect(addTransaction(db, { ...base, amount_paise: -5 })).rejects.toThrow();
    await expect(addTransaction(db, { ...base, amount_paise: 10.5 })).rejects.toThrow();
  });

  it('never allows UPDATE on transactions', async () => {
    const db = await freshDb();
    const id = await addTransaction(db, { type: 'expense', account_id: CASH, category_id: null, amount_paise: 100 });
    await expect(db.runAsync('UPDATE transactions SET amount_paise = 1 WHERE id = ?', id)).rejects.toThrow(/immutable/);
  });

  it('edits via correction rows, keeping the original', async () => {
    const db = await freshDb();
    const id = await addTransaction(db, { type: 'expense', account_id: CASH, category_id: CATEGORY_ID.chai, amount_paise: 2_000 });
    const [tx] = await effective(db);
    await correctTransaction(db, tx, { account_id: UPI, category_id: CATEGORY_ID.food, amount_paise: 25_000, note: 'lunch' });

    const rows = await listTransactionRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id, amount_paise: 2_000, type: 'expense' });
    expect(rows[1]).toMatchObject({ type: 'correction', corrects_id: id, amount_paise: 25_000 });

    const [edited] = await effective(db);
    expect(edited).toMatchObject({ id, account_id: UPI, category_id: CATEGORY_ID.food, amount_paise: 25_000, note: 'lunch' });
    const balances = computeBalances([CASH, UPI], await effective(db));
    expect(balances.get(CASH)).toBe(0);
    expect(balances.get(UPI)).toBe(-25_000);
  });

  it('skips corrections that change nothing', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'expense', account_id: CASH, category_id: CATEGORY_ID.chai, amount_paise: 2_000 });
    const [tx] = await effective(db);
    const result = await correctTransaction(db, tx, { account_id: CASH, category_id: CATEGORY_ID.chai, amount_paise: 2_000, note: '  ' });
    expect(result).toBeNull();
    expect(await listTransactionRows(db)).toHaveLength(1);
  });

  it('deletes via a zero-amount correction', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'expense', account_id: CASH, category_id: null, amount_paise: 5_000 });
    const [tx] = await effective(db);
    await correctTransaction(db, tx, { account_id: CASH, category_id: null, amount_paise: 0, note: null });
    const [deleted] = await effective(db);
    expect(deleted.voided).toBe(true);
    expect(computeBalances([CASH], await effective(db)).get(CASH)).toBe(0);
  });

  it('undo removes a fresh entry but not one that was corrected', async () => {
    const db = await freshDb();
    const fresh = await addTransaction(db, { type: 'expense', account_id: CASH, category_id: null, amount_paise: 100 });
    expect(await undoNewTransaction(db, fresh)).toBe(true);
    expect(await listTransactionRows(db)).toHaveLength(0);

    const kept = await addTransaction(db, { type: 'expense', account_id: CASH, category_id: null, amount_paise: 100 });
    const [tx] = await effective(db);
    await correctTransaction(db, tx, { account_id: CASH, category_id: null, amount_paise: 200, note: null });
    expect(await undoNewTransaction(db, kept)).toBe(false);
    expect(await listTransactionRows(db)).toHaveLength(2);
  });
});

describe('accounts and settings', () => {
  it('adds custom accounts and stores the last used account', async () => {
    const db = await freshDb();
    const id = await addAccount(db, '  Wallet  ', 'other');
    expect((await listAccounts(db)).find((a) => a.id === id)?.name).toBe('Wallet');
    await expect(addAccount(db, '   ', 'other')).rejects.toThrow();

    expect(await getSetting(db, 'last_account_id')).toBeNull();
    await setSetting(db, 'last_account_id', String(id));
    await setSetting(db, 'last_account_id', String(CASH));
    expect(await getSetting(db, 'last_account_id')).toBe(String(CASH));
  });
});
