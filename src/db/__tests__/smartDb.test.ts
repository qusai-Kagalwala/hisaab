import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../../engine/defaults';
import { goalStatus } from '../../engine/goals';
import { parseEntry } from '../../engine/parser';
import { LATEST_SCHEMA_VERSION, migrate } from '../migrations';
import {
  addChat, addContribution, addGoal, clearChat, deleteContribution, learnMerchant, listChat,
  listContributions, listGoals, listMerchantMemory, setGoalStatus, updateGoal,
} from '../smartQueries';
import type { Db } from '../types';
import { parseBackup } from '../../engine/backup';
import { resolveTransactions } from '../../engine/ledger';
import { exportAll, importAll } from '../backupQueries';
import { addTransaction, correctTransaction, listTransactionRows } from '../queries';
import { createTestDb } from './nodeSqliteDb';

async function freshDb(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}
const now = new Date(2026, 8, 28, 12).getTime();

describe('goals in the database', () => {
  it('adds, contributes, undoes, finishes and removes', async () => {
    const db = await freshDb();
    const id = await addGoal(db, { name: ' Laptop ', target_paise: 8_000_000, target_date: null }, now);
    await expect(addGoal(db, { name: '', target_paise: 1, target_date: null })).rejects.toThrow();
    await expect(addGoal(db, { name: 'X', target_paise: 0, target_date: null })).rejects.toThrow();

    await addContribution(db, id, 500_000, now);
    const oops = await addContribution(db, id, 100_000, now);
    await deleteContribution(db, oops);
    await expect(addContribution(db, id, 0)).rejects.toThrow();

    const [goal] = await listGoals(db);
    expect(goal).toMatchObject({ name: 'Laptop', status: 'active' });
    expect(goalStatus(goal, await listContributions(db), now).saved_paise).toBe(500_000);

    await updateGoal(db, id, { name: 'MacBook', target_paise: 9_000_000, target_date: null });
    await setGoalStatus(db, id, 'done');
    expect((await listGoals(db))[0]).toMatchObject({ name: 'MacBook', status: 'done' });
    await setGoalStatus(db, id, 'removed');
    expect(await listGoals(db)).toEqual([]);
  });
});

describe('merchant memory', () => {
  it('learns and relearns from corrections', async () => {
    const db = await freshDb();
    const cats = DEFAULT_CATEGORIES.map((c) => ({ ...c, hidden: false }));
    expect(parseEntry('dmart 450', cats, await listMerchantMemory(db)).category_id).toBeNull();

    await learnMerchant(db, 'DMart 450', C.shopping);
    await learnMerchant(db, 'dmart', C.shopping);
    expect(await listMerchantMemory(db)).toEqual([{ text_pattern: 'dmart', category_id: C.shopping, hit_count: 2 }]);

    await learnMerchant(db, 'dmart', C.groceries); // user corrected it
    expect(await listMerchantMemory(db)).toEqual([{ text_pattern: 'dmart', category_id: C.groceries, hit_count: 1 }]);
    expect(parseEntry('dmart 450', cats, await listMerchantMemory(db)).category_id).toBe(C.groceries);

    await learnMerchant(db, '450', C.food); // nothing to learn from a bare number
    expect(await listMerchantMemory(db)).toHaveLength(1);
  });
});

describe('chat history', () => {
  it('stores and clears messages in order', async () => {
    const db = await freshDb();
    await addChat(db, 'user', 'kitna paisa hai', now);
    await addChat(db, 'assistant', 'Aapke paas…', now);
    expect((await listChat(db)).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((await listChat(db, 1)).map((m) => m.role)).toEqual(['assistant']);
    await clearChat(db);
    expect(await listChat(db)).toEqual([]);
  });
});

describe('backup round trip', () => {
  it('exports everything and imports it into a fresh database exactly', async () => {

    const src = await freshDb();
    await addTransaction(src, { type: 'expense', account_id: 1, category_id: C.chai, amount_paise: 2_000, note: 'chai' });
    const [tx] = resolveTransactions(await listTransactionRows(src));
    await correctTransaction(src, tx, { account_id: 1, category_id: C.chai, amount_paise: 2_500, note: 'chai' });
    const goalId = await addGoal(src, { name: 'Laptop', target_paise: 8_000_000, target_date: null });
    await addContribution(src, goalId, 100_000);
    await learnMerchant(src, 'dmart', C.groceries);

    const text = JSON.stringify(await exportAll(src));
    const { backup } = parseBackup(text, LATEST_SCHEMA_VERSION);

    const dst = await freshDb();
    await addTransaction(dst, { type: 'expense', account_id: 1, category_id: null, amount_paise: 1 }); // replaced
    await importAll(dst, backup);
    expect(await listTransactionRows(dst)).toEqual(await listTransactionRows(src));
    expect(await listContributions(dst)).toEqual(await listContributions(src));
    expect(await listMerchantMemory(dst)).toEqual(await listMerchantMemory(src));
    // Immutability still enforced after import
    await expect(dst.runAsync('UPDATE transactions SET amount_paise = 1')).rejects.toThrow(/immutable/);
  });

  it('a failed import changes nothing', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'expense', account_id: 1, category_id: null, amount_paise: 1_234 });
    const broken = { app: 'hisaab', format: 1, schema_version: 4, exported_at: 0, tables: {
      accounts: [{ id: 1, name: 'Cash', type: 'cash', created_at: 0 }],
      transactions: [{ id: 1, account_id: 999, amount_paise: 5, type: 'expense', created_at: 0 }], // bad FK
    } } as never;
    await expect(importAll(db, broken)).rejects.toThrow();
    expect((await listTransactionRows(db)).map((r) => r.amount_paise)).toEqual([1_234]);
  });
});
