import { parseBackup } from '../../engine/backup';
import { firstDueDate } from '../../engine/debts';
import { CATEGORY_ID } from '../../engine/defaults';
import { computeBalances, resolveTransactions } from '../../engine/ledger';
import { exportAll, importAll } from '../backupQueries';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrations';
import { addDebt, addDebtPayment, listDebts, undoNewDebt, updateDebtPlan } from '../peopleQueries';
import {
  addTransaction,
  addTransfer,
  correctTransaction,
  listAccounts,
  listTransactionRows,
  setAccountArchived,
  undoNewTransaction,
} from '../queries';
import { readSnapshot } from '../snapshot';
import type { Db } from '../types';
import { createTestDb } from './nodeSqliteDb';

const CASH = 1;
const BANK = 2;
const now = new Date(2026, 8, 20, 12).getTime();

async function freshDb(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}

async function effective(db: Db) {
  return resolveTransactions(await listTransactionRows(db));
}

describe('migration 6', () => {
  it('upgrades a Phase 5 database: old entries, corrections and balances stay the same', async () => {
    const db = createTestDb();
    await migrate(db, 5);
    await db.runAsync(
      `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id)
       VALUES (2, 13, NULL, 3000000, 'income', 'salary', 1, NULL), (1, 2, NULL, 2000, 'expense', 'chai', 2, NULL)`,
    );
    await db.runAsync(
      `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id)
       VALUES (1, 2, NULL, 2500, 'correction', 'chai', 3, 2)`,
    );
    await migrate(db);
    expect(computeBalances([CASH, BANK], await effective(db))).toEqual(new Map([[CASH, -2_500], [BANK, 3_000_000]]));
    expect((await listAccounts(db)).every((a) => a.archived === false)).toBe(true);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(LATEST_SCHEMA_VERSION);
  });

  it('transactions are still immutable', async () => {
    const db = await freshDb();
    const id = await addTransfer(db, { account_id: BANK, to_account_id: CASH, amount_paise: 1_000 });
    await expect(db.runAsync('UPDATE transactions SET to_account_id = 1 WHERE id = ?', id)).rejects.toThrow(/immutable/);
  });
});

describe('transfers', () => {
  it('moves money between accounts, can be edited, deleted and undone', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: BANK, category_id: CATEGORY_ID.salary, amount_paise: 3_000_000 });
    const id = await addTransfer(db, { account_id: BANK, to_account_id: CASH, amount_paise: 200_000, note: 'ATM' });
    let txs = await effective(db);
    expect(computeBalances([CASH, BANK], txs)).toEqual(new Map([[CASH, 200_000], [BANK, 2_800_000]]));

    const tx = txs.find((t) => t.id === id)!;
    await correctTransaction(db, tx, { account_id: BANK, category_id: null, amount_paise: 150_000, note: 'ATM' });
    txs = await effective(db);
    expect(computeBalances([CASH, BANK], txs)).toEqual(new Map([[CASH, 150_000], [BANK, 2_850_000]]));

    await correctTransaction(db, txs.find((t) => t.id === id)!, { account_id: BANK, category_id: null, amount_paise: 0, note: null });
    expect(computeBalances([CASH, BANK], await effective(db)).get(CASH)).toBe(0);

    const again = await addTransfer(db, { account_id: CASH, to_account_id: BANK, amount_paise: 1 });
    expect(await undoNewTransaction(db, again)).toBe(true);
  });

  it('refuses bad transfers', async () => {
    const db = await freshDb();
    await expect(addTransfer(db, { account_id: CASH, to_account_id: CASH, amount_paise: 1 })).rejects.toThrow();
    await expect(addTransfer(db, { account_id: CASH, amount_paise: 1 })).rejects.toThrow();
    await expect(addTransfer(db, { account_id: CASH, to_account_id: BANK, amount_paise: 0 })).rejects.toThrow();
  });
});

describe('borrow & lend', () => {
  it('borrowing with a 3-month plan: money in, instalment kept aside, repayments confirmed by the user', async () => {
    const db = await freshDb();
    const firstDue = firstDueDate(now, 5); // 5 Oct
    const { debtId } = await addDebt(db, {
      person: ' Rahul ', kind: 'borrowed', amount_paise: 1_000_000, account_id: BANK,
      plan: { months: 3 }, first_due: firstDue, created_at: now,
    });
    let snap = await readSnapshot(db, now);
    expect(snap.balances.get(BANK)).toBe(1_000_000);
    const debt = snap.debts[0];
    expect(debt).toMatchObject({ person: 'Rahul', principal_paise: 1_000_000, outstanding_paise: 1_000_000 });
    expect(debt.schedule.map((s) => s.amount_paise)).toEqual([333_334, 333_333, 333_333]);
    // Nothing due in September yet → all of it counts; no income recorded.
    expect(snap.picture.repayments_paise).toBe(0);

    // In October the first instalment is kept aside.
    const october = new Date(2026, 9, 2, 12).getTime();
    snap = await readSnapshot(db, october);
    expect(snap.picture.repayments_paise).toBe(333_334);
    expect(snap.picture.unallocated_paise).toBe(1_000_000 - 333_334);

    await addDebtPayment(db, { id: debtId, kind: 'borrowed' }, 333_334, BANK);
    snap = await readSnapshot(db, october);
    expect(snap.picture.repayments_paise).toBe(0);
    expect(snap.debts[0].outstanding_paise).toBe(666_666);
    expect(snap.balances.get(BANK)).toBe(666_666);

    // Change the plan: the rest over 1 more month.
    await updateDebtPlan(db, debtId, 1_000_000, { per_month_paise: 500_000 }, firstDue);
    expect((await listDebts(db))[0]).toMatchObject({ months: null, per_month_paise: 500_000 });
    snap = await readSnapshot(db, october);
    expect(snap.debts[0].schedule.map((s) => s.amount_paise)).toEqual([500_000, 500_000]);
    expect(snap.picture.repayments_paise).toBe(500_000 - 333_334);
    // Spending insights and income ignore all of it.
    expect(snap.monthSpending.size).toBe(0);
  });

  it('lending: money out, got back in parts', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: CASH, category_id: CATEGORY_ID.salary, amount_paise: 100_000 });
    const { debtId } = await addDebt(db, {
      person: 'Aman', kind: 'lent', amount_paise: 50_000, account_id: CASH,
      plan: { months: 3 }, first_due: null, created_at: now,
    });
    await addDebtPayment(db, { id: debtId, kind: 'lent' }, 20_000, CASH);
    const snap = await readSnapshot(db, now);
    expect(snap.balances.get(CASH)).toBe(70_000);
    expect(snap.debts[0]).toMatchObject({ kind: 'lent', months: null, outstanding_paise: 30_000 });
    expect(snap.picture.repayments_paise).toBe(0);
  });

  it('undo right after recording removes it; not after a payment', async () => {
    const db = await freshDb();
    const a = await addDebt(db, { person: 'X', kind: 'lent', amount_paise: 100, account_id: CASH, plan: {}, first_due: null });
    expect(await undoNewDebt(db, a.debtId)).toBe(true);
    expect(await listDebts(db)).toEqual([]);
    const b = await addDebt(db, { person: 'Y', kind: 'lent', amount_paise: 100, account_id: CASH, plan: {}, first_due: null });
    await addDebtPayment(db, { id: b.debtId, kind: 'lent' }, 50, CASH);
    expect(await undoNewDebt(db, b.debtId)).toBe(false);
  });

  it('requires a person, an amount and a first date for a plan', async () => {
    const db = await freshDb();
    const base = { kind: 'borrowed' as const, account_id: CASH, plan: {}, first_due: null };
    await expect(addDebt(db, { ...base, person: ' ', amount_paise: 100 })).rejects.toThrow();
    await expect(addDebt(db, { ...base, person: 'Z', amount_paise: 0 })).rejects.toThrow();
    await expect(addDebt(db, { ...base, person: 'Z', amount_paise: 100, plan: { months: 2 } })).rejects.toThrow(/first payment/);
    expect(await listDebts(db)).toEqual([]);
  });
});

describe('removing accounts and backups', () => {
  it('a removed account is hidden from pickers but its entries still count', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: CASH, category_id: CATEGORY_ID.gift, amount_paise: 5_000 });
    await setAccountArchived(db, CASH, true);
    const snap = await readSnapshot(db, now);
    expect(snap.accounts.map((a) => a.id)).toEqual([BANK]);
    expect(snap.allAccounts.map((a) => a.id)).toEqual([CASH, BANK]);
    expect(snap.lastAccountId).toBe(BANK);
    expect(snap.picture.total_paise).toBe(5_000);
  });

  it('backup round-trips debts, transfers and removed accounts', async () => {
    const src = await freshDb();
    await addTransfer(src, { account_id: BANK, to_account_id: CASH, amount_paise: 1_000 });
    await addDebt(src, { person: 'Rahul', kind: 'borrowed', amount_paise: 9_000, account_id: BANK, plan: { per_month_paise: 3_000 }, first_due: firstDueDate(now) });
    await addDebt(src, { person: 'Aman', kind: 'lent', amount_paise: 500, account_id: CASH, plan: {}, first_due: null });
    await setAccountArchived(src, CASH, true);
    const text = JSON.stringify(await exportAll(src, now));

    const dst = await freshDb();
    const { backup } = parseBackup(text, LATEST_SCHEMA_VERSION);
    await importAll(dst, backup);
    const a = await readSnapshot(src, now);
    const b = await readSnapshot(dst, now);
    expect(b.balances).toEqual(a.balances);
    expect(b.debts).toEqual(a.debts);
    expect(b.accounts.map((x) => x.id)).toEqual([BANK]);
  });
});

describe('migrate is safe to run from two places', () => {
  it('a second run (e.g. the widget) after an upgrade changes nothing', async () => {
    const db = createTestDb();
    await migrate(db, 5);
    await migrate(db);
    await migrate(db);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(LATEST_SCHEMA_VERSION);
  });

  it('a failed step rolls back completely', async () => {
    const db = createTestDb();
    await migrate(db, 5);
    await db.execAsync('ALTER TABLE accounts ADD COLUMN archived INTEGER'); // makes step 6 fail
    await expect(migrate(db)).rejects.toThrow();
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(5);
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'debts'")).toBeNull();
  });
});
