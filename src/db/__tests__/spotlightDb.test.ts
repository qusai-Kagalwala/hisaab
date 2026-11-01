import { moneyAddsUp } from '../../engine/buckets';
import { CATEGORY_ID } from '../../engine/defaults';
import { exportAll, importAll } from '../backupQueries';
import { parseBackup } from '../../engine/backup';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrations';
import { addRecurring } from '../moneyQueries';
import { addAccount, addTransaction, addTransfer, setSetting, SETTING_SPOTLIGHT, undoNewTransaction } from '../queries';
import { addSavingsMove, addSavingsTransfer, savingsBalance, settleLegacySavings } from '../savingsQueries';
import { readSnapshot } from '../snapshot';
import { createTestDb } from './nodeSqliteDb';

const now = new Date(2026, 9, 10, 12).getTime();
const CASH = 1;
const BANK = 2;

async function setup() {
  const db = createTestDb();
  await migrate(db);
  const second = await addAccount(db, 'SBI Savings', 'upi_bank');
  await addTransaction(db, { type: 'income', account_id: BANK, category_id: CATEGORY_ID.salary, amount_paise: 30_000_00, created_at: now - 5000 });
  await addTransaction(db, { type: 'income', account_id: CASH, category_id: CATEGORY_ID.salary, amount_paise: 2_000_00, created_at: now - 4000 });
  await addTransaction(db, { type: 'income', account_id: second, category_id: CATEGORY_ID.salary, amount_paise: 60_000_00, created_at: now - 3000 });
  await addTransaction(db, { type: 'expense', account_id: CASH, category_id: CATEGORY_ID.food, amount_paise: 300_00, created_at: now - 2000 });
  await addTransaction(db, { type: 'expense', account_id: BANK, category_id: CATEGORY_ID.food, amount_paise: 500_00, created_at: now - 1000 });
  return { db, second };
}

describe('spotlight account', () => {
  it('with no spotlight everything counts (unchanged behaviour)', async () => {
    const { db } = await setup();
    const snap = await readSnapshot(db, now);
    expect(snap.spotlightId).toBeNull();
    expect(snap.picture.total_paise).toBe(91_200_00);
    expect(snap.spending).toHaveLength(snap.transactions.length);
  });

  it('counts only the spotlight account for safe to spend, insights and month spending', async () => {
    const { db } = await setup();
    await setSetting(db, SETTING_SPOTLIGHT, String(BANK));
    const snap = await readSnapshot(db, now);
    expect(snap.spotlightId).toBe(BANK);
    expect(snap.picture.total_paise).toBe(29_500_00);
    expect(moneyAddsUp(snap.picture)).toBe(true);
    expect(snap.spending.every((t) => t.account_id === BANK)).toBe(true);
    expect([...snap.monthSpending.values()].reduce((a, b) => a + b, 0)).toBe(500_00);
    // Other balances are still tracked.
    expect(snap.balances.get(CASH)).toBe(1_700_00);
    // New entries start in the spotlight account.
    expect(snap.lastAccountId).toBe(BANK);
  });

  it('moving money into the spotlight account makes it count', async () => {
    const { db, second } = await setup();
    await setSetting(db, SETTING_SPOTLIGHT, String(BANK));
    await addTransfer(db, { account_id: second, to_account_id: BANK, amount_paise: 10_000_00, created_at: now - 500 });
    const snap = await readSnapshot(db, now);
    expect(snap.picture.total_paise).toBe(39_500_00);
  });

  it('only bills on the spotlight account are kept aside', async () => {
    const { db } = await setup();
    await addRecurring(db, { type: 'expense', name: 'Rent', amount_paise: 8_000_00, account_id: BANK, category_id: CATEGORY_ID.rent, rule: 'monthly', anchor_day: 20 }, now);
    await addRecurring(db, { type: 'expense', name: 'Milk', amount_paise: 900_00, account_id: CASH, category_id: CATEGORY_ID.food, rule: 'monthly', anchor_day: 20 }, now);
    expect((await readSnapshot(db, now)).picture.reserved_paise).toBe(8_900_00);
    await setSetting(db, SETTING_SPOTLIGHT, String(BANK));
    expect((await readSnapshot(db, now)).picture.reserved_paise).toBe(8_000_00);
  });

  it('a removed or unknown spotlight falls back to all accounts', async () => {
    const { db } = await setup();
    await setSetting(db, SETTING_SPOTLIGHT, '99');
    expect((await readSnapshot(db, now)).spotlightId).toBeNull();
    await setSetting(db, SETTING_SPOTLIGHT, '');
    expect((await readSnapshot(db, now)).spotlightId).toBeNull();
  });
});

describe('Savings as money handed over', () => {
  it('leaves the account, belongs to no account, and is never spendable', async () => {
    const { db } = await setup();
    await setSetting(db, SETTING_SPOTLIGHT, String(BANK));
    const before = await readSnapshot(db, now);
    const id = await addSavingsTransfer(db, { account_id: BANK, amount_paise: 10_000_00, direction: 'out', created_at: now - 100 });
    const snap = await readSnapshot(db, now);
    expect(snap.balances.get(BANK)).toBe(before.balances.get(BANK)! - 10_000_00);
    expect(snap.savings).toEqual({ total_paise: 10_000_00, legacy_paise: 0 });
    expect(snap.picture.savings_paise).toBe(0); // not subtracted again: it already left the account
    expect(snap.picture.total_paise).toBe(19_500_00);
    expect(moneyAddsUp(snap.picture)).toBe(true);
    // Not spending in insights either.
    expect([...snap.monthSpending.values()].reduce((a, b) => a + b, 0)).toBe(500_00);
    // Undo puts it back.
    expect(await undoNewTransaction(db, id)).toBe(true);
    expect((await readSnapshot(db, now)).savings.total_paise).toBe(0);
  });

  it('taking back is refused beyond what Savings holds', async () => {
    const { db } = await setup();
    await addSavingsTransfer(db, { account_id: BANK, amount_paise: 1_000_00, direction: 'out' });
    await expect(addSavingsTransfer(db, { account_id: CASH, amount_paise: 2_000_00, direction: 'in', available_paise: 1_000_00 }))
      .rejects.toThrow('more than what is in Savings');
    await addSavingsTransfer(db, { account_id: CASH, amount_paise: 400_00, direction: 'in', available_paise: 1_000_00 });
    const snap = await readSnapshot(db, now);
    expect(snap.savings.total_paise).toBe(600_00);
    expect(snap.balances.get(CASH)).toBe(2_100_00);
  });

  it('old-style Savings is settled once into an account, keeping the total', async () => {
    const { db } = await setup();
    await addSavingsMove(db, 5_000_00, null, now - 10_000);
    let snap = await readSnapshot(db, now);
    expect(snap.savings).toEqual({ total_paise: 5_000_00, legacy_paise: 5_000_00 });
    expect(snap.picture.savings_paise).toBe(5_000_00); // still inside the accounts → subtracted
    const bankBefore = snap.balances.get(BANK)!;

    expect(await settleLegacySavings(db, BANK, now)).not.toBeNull();
    snap = await readSnapshot(db, now);
    expect(snap.savings).toEqual({ total_paise: 5_000_00, legacy_paise: 0 });
    expect(await savingsBalance(db)).toBe(0);
    expect(snap.balances.get(BANK)).toBe(bankBefore - 5_000_00);
    expect(snap.picture.savings_paise).toBe(0);
    expect(moneyAddsUp(snap.picture)).toBe(true);
    // Nothing left to settle the second time.
    expect(await settleLegacySavings(db, BANK, now)).toBeNull();
  });

  it('survives backup and restore', async () => {
    const { db } = await setup();
    await setSetting(db, SETTING_SPOTLIGHT, String(BANK));
    await addSavingsTransfer(db, { account_id: BANK, amount_paise: 2_500_00, direction: 'out' });
    const json = JSON.stringify(await exportAll(db));
    const fresh = createTestDb();
    await migrate(fresh);
    await importAll(fresh, parseBackup(json, LATEST_SCHEMA_VERSION).backup);
    const snap = await readSnapshot(fresh, now);
    expect(snap.savings.total_paise).toBe(2_500_00);
    expect(snap.spotlightId).toBe(BANK);
  });
});
