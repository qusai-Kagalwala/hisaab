import { parseBackup } from '../../engine/backup';
import { moneyAddsUp } from '../../engine/buckets';
import { CATEGORY_ID } from '../../engine/defaults';
import { exportAll, importAll } from '../backupQueries';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrations';
import { addTransaction } from '../queries';
import { addSavingsMove, savingsBalance, undoSavingsMove } from '../savingsQueries';
import { readSnapshot } from '../snapshot';
import { createTestDb } from './nodeSqliteDb';

const now = new Date(2026, 9, 10, 12).getTime();

async function dbWithMoney() {
  const db = createTestDb();
  await migrate(db);
  await addTransaction(db, { type: 'income', account_id: 2, category_id: CATEGORY_ID.salary, amount_paise: 2_100_000, created_at: now - 1000 });
  return db;
}

describe('savings', () => {
  it('money in Savings is not spendable; taking it out makes it spendable again', async () => {
    const db = await dbWithMoney();
    const before = await readSnapshot(db, now);
    const id = await addSavingsMove(db, 500_000);
    let snap = await readSnapshot(db, now);
    expect(snap.picture.savings_paise).toBe(500_000);
    expect(snap.picture.total_paise).toBe(2_100_000); // still your money
    expect(snap.safe.pool_paise).toBe(before.safe.pool_paise - 500_000);
    expect(moneyAddsUp(snap.picture)).toBe(true);

    const out = await addSavingsMove(db, -200_000);
    expect(await savingsBalance(db)).toBe(300_000);
    // Undoing the add now would leave Savings at −₹2,000 → refused.
    expect(await undoSavingsMove(db, id)).toBe(false);
    expect(await undoSavingsMove(db, out)).toBe(true);
    snap = await readSnapshot(db, now);
    expect(snap.picture.savings_paise).toBe(500_000);
  });

  it('refuses a zero move; survives backup and restore', async () => {
    const db = await dbWithMoney();
    await expect(addSavingsMove(db, 0)).rejects.toThrow();
    await addSavingsMove(db, 123_450);
    const { backup } = parseBackup(JSON.stringify(await exportAll(db, now)), LATEST_SCHEMA_VERSION);
    const dst = createTestDb();
    await migrate(dst);
    await importAll(dst, backup);
    expect(await savingsBalance(dst)).toBe(123_450);
  });

  it('upgrades a version 6 database', async () => {
    const db = createTestDb();
    await migrate(db, 6);
    await migrate(db);
    expect(await savingsBalance(db)).toBe(0);
  });
});
