import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { migrate } from '../../db/migrations';
import { createBuckets } from '../../db/moneyQueries';
import { addTransaction, listTransactionRows, setSetting } from '../../db/queries';
import type { Db } from '../../db/types';
import { CATEGORY_ID as C } from '../../engine/defaults';
import { logFromWidget, monthWidgetState, undoFromWidget, widgetState, WIDGET_UNDO_MS } from '../actions';

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

describe('widget while Hisaab is locked', () => {
  it('shows no amounts or chips when "hide amounts" is on; shows them again when the lock is off', async () => {
    const db = await freshDb();
    await addTransaction(db, { type: 'income', account_id: 1, category_id: C.salary, amount_paise: 1_000_000 });
    await addTransaction(db, { type: 'expense', account_id: 1, category_id: C.chai, amount_paise: 2_000 });
    await setSetting(db, 'app_lock', '1');
    await setSetting(db, 'widget_hide_amounts', '1');
    const locked = await widgetState(db, Date.now());
    expect(locked).toMatchObject({ hidden: true, safe_per_day_paise: 0, picks: [] });
    await setSetting(db, 'app_lock', '0');
    const open = await widgetState(db, Date.now());
    expect(open.hidden).toBe(false);
    expect(open.picks.length).toBeGreaterThan(0);
  });
});

describe('this-month widget', () => {
  it('has one bar per day, future days empty, scaled 0–1; hidden while locked', async () => {
    const db = await freshDb();
    const now = new Date(2026, 9, 10, 20).getTime();
    await addTransaction(db, { type: 'income', account_id: 1, category_id: C.salary, amount_paise: 3_100_000, created_at: new Date(2026, 9, 1).getTime() });
    await addTransaction(db, { type: 'expense', account_id: 1, category_id: C.food, amount_paise: 50_000, created_at: new Date(2026, 9, 3, 13).getTime() });
    await addTransaction(db, { type: 'expense', account_id: 1, category_id: C.chai, amount_paise: 2_000, created_at: new Date(2026, 9, 10, 9).getTime() });
    const s = await monthWidgetState(db, now);
    expect(s.month_name).toBe('October');
    expect(s.bars).toHaveLength(31);
    expect(s.bars.slice(10).every((b) => b === null)).toBe(true);
    expect(s.bars.slice(0, 10).every((b) => b != null && b >= 0 && b <= 1)).toBe(true);
    expect(s.spent_paise).toBe(52_000);
    expect(s.today).toBe(10);
    await setSetting(db, 'app_lock', '1');
    expect((await monthWidgetState(db, now)).hidden).toBe(true);
  });
});
