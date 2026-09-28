import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../../engine/defaults';
import { goalStatus } from '../../engine/goals';
import { parseEntry } from '../../engine/parser';
import { migrate } from '../migrations';
import {
  addChat, addContribution, addGoal, clearChat, deleteContribution, learnMerchant, listChat,
  listContributions, listGoals, listMerchantMemory, setGoalStatus, updateGoal,
} from '../smartQueries';
import type { Db } from '../types';
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
