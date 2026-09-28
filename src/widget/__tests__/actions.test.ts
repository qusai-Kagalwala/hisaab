import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { migrate } from '../../db/migrations';
import { createBuckets } from '../../db/moneyQueries';
import { addTransaction, listTransactionRows, setSetting } from '../../db/queries';
import type { Db } from '../../db/types';
import { CATEGORY_ID as C } from '../../engine/defaults';
import { logFromWidget, undoFromWidget, widgetState, WIDGET_UNDO_MS } from '../actions';

const now = new Date(2026, 8, 28, 10).getTime();
async function freshDb(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}

describe('widget', () => {
  it('shows safe-to-spend and the top quick picks', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: 2, category_id: C.salary, amount_paise: 300_000, created_at: now - 1000 });
    for (let i = 0; i < 3; i++) await addTransaction(db, { type: 'expense', account_id: 1, category_id: C.chai, amount_paise: 2_000, created_at: now - 5000 });
    for (let i = 0; i < 2; i++) await addTransaction(db, { type: 'expense', account_id: 1, category_id: C.transport, amount_paise: 5_000, created_at: now - 5000 });
    const s = await widgetState(db, now);
    expect(s.picks.map((p) => [p.name, p.amount_paise, p.icon])).toEqual([['Chai & Snacks', 2_000, 'coffee'], ['Transport', 5_000, 'rickshaw']]);
    expect(s.safe_per_day_paise).toBe(Math.floor((300_000 - 6_000 - 10_000) / 3));
    expect(s.has_money).toBe(true);
    expect(s.last_saved).toBeNull();
  });

  it('logs a tap like the app does (last account, bucket from category) and offers undo', async () => {
    const db = await freshDb();
    await setSetting(db, 'last_account_id', '2');
    await createBuckets(db, '2026-09', [
      { name: 'Personal', role: null, sort_order: 0, category_ids: [C.chai], allocated_paise: 10_000 },
      { name: 'Flexible', role: 'flexible', sort_order: 1, category_ids: [], allocated_paise: 0 },
    ]);
    const id = await logFromWidget(db, { category_id: C.chai, amount_paise: 2_000 }, now);
    const [row] = await listTransactionRows(db);
    expect(row).toMatchObject({ id, account_id: 2, category_id: C.chai, amount_paise: 2_000, bucket_id: 1, type: 'expense' });
    expect((await widgetState(db, now + 1000)).last_saved).toEqual({ id, label: 'Saved ₹20 · Chai & Snacks' });

    expect(await undoFromWidget(db, now + 5000)).toBe(true);
    expect(await listTransactionRows(db)).toHaveLength(0);
    expect((await widgetState(db, now + 6000)).last_saved).toBeNull();
  });

  it('undo expires, and bad taps are refused', async () => {
    const db = await freshDb();
    await logFromWidget(db, { category_id: C.chai, amount_paise: 2_000 }, now);
    expect((await widgetState(db, now + WIDGET_UNDO_MS)).last_saved).toBeNull();
    expect(await undoFromWidget(db, now + WIDGET_UNDO_MS)).toBe(false);
    expect(await listTransactionRows(db)).toHaveLength(1);
    await expect(logFromWidget(db, { category_id: C.salary, amount_paise: 100 }, now)).rejects.toThrow();
    await expect(logFromWidget(db, { category_id: 17, amount_paise: 100 }, now)).rejects.toThrow();
    await expect(logFromWidget(db, { category_id: C.chai, amount_paise: 0 }, now)).rejects.toThrow();
    await expect(logFromWidget(db, { category_id: C.chai, amount_paise: 1.5 }, now)).rejects.toThrow();
  });
});
