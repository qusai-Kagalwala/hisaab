import { BUCKET_TEMPLATES, computeMoneyPicture, splitByPercent } from '../../engine/buckets';
import { CATEGORY_ID } from '../../engine/defaults';
import { computeBalances, resolveTransactions } from '../../engine/ledger';
import { reservedThisMonth } from '../../engine/recurring';
import { migrate } from '../migrations';
import {
  addRecurring,
  confirmPending,
  createBuckets,
  deleteBucketIfUnused,
  generatePending,
  listAllBuckets,
  listPending,
  listRecurring,
  reopenPending,
  setAllocations,
  setRecurringActive,
  skipPending,
  updateBucket,
  updateRecurring,
} from '../moneyQueries';
import { addTransaction, listTransactionRows } from '../queries';
import type { Db } from '../types';
import { createTestDb } from './nodeSqliteDb';

const day = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

async function freshDb(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}

const salary = {
  type: 'income' as const, name: 'Salary', amount_paise: 3_000_000, account_id: 2,
  category_id: CATEGORY_ID.salary, rule: 'monthly' as const, anchor_day: 1,
};
const rent = {
  type: 'expense' as const, name: 'Rent', amount_paise: 800_000, account_id: 2,
  category_id: CATEGORY_ID.rent, rule: 'monthly' as const, anchor_day: 5,
};

describe('recurring → pending → confirm', () => {
  it('never creates transactions on its own', async () => {
    const db = await freshDb();
    await addRecurring(db, salary, day(2026, 9, 28));
    expect((await listRecurring(db))[0].next_due).toBe(new Date(2026, 9, 1).getTime());

    expect(await generatePending(db, day(2026, 9, 30))).toBe(0);
    expect(await generatePending(db, day(2026, 10, 1))).toBe(1);
    expect(await generatePending(db, day(2026, 10, 1, 18))).toBe(0); // idempotent
    expect(await listTransactionRows(db)).toHaveLength(0);

    const [item] = await listPending(db);
    expect(item).toMatchObject({ name: 'Salary', amount_paise: 3_000_000, type: 'income', status: 'pending' });
  });

  it('confirms with an edited amount, and undo brings the card back', async () => {
    const db = await freshDb();
    await addRecurring(db, salary, day(2026, 9, 28));
    await generatePending(db, day(2026, 10, 2));
    const [item] = await listPending(db);

    const txId = await confirmPending(db, item, 2_950_000, day(2026, 10, 2));
    expect(await listPending(db)).toHaveLength(0);
    const rows = await listTransactionRows(db);
    expect(rows).toEqual([expect.objectContaining({ id: txId, type: 'income', amount_paise: 2_950_000, bucket_id: null, note: 'Salary' })]);
    await expect(confirmPending(db, item, 1, day(2026, 10, 2))).rejects.toThrow();

    expect(await reopenPending(db, item.id)).toBe(true);
    expect(await listPending(db)).toHaveLength(1);
    expect(await listTransactionRows(db)).toHaveLength(0);
  });

  it('skips, and undo of skip reopens', async () => {
    const db = await freshDb();
    await addRecurring(db, rent, day(2026, 9, 28));
    await generatePending(db, day(2026, 10, 6));
    const [item] = await listPending(db);
    await skipPending(db, item.id);
    expect(await listPending(db)).toHaveLength(0);
    await reopenPending(db, item.id);
    expect(await listPending(db)).toHaveLength(1);
  });

  it('pausing stops new cards; resuming does not back-fill', async () => {
    const db = await freshDb();
    const id = await addRecurring(db, rent, day(2026, 9, 28));
    await setRecurringActive(db, id, false);
    expect(await generatePending(db, day(2026, 12, 6))).toBe(0);
    await setRecurringActive(db, id, true, day(2026, 12, 6));
    expect(await generatePending(db, day(2026, 12, 7))).toBe(0);
    expect((await listRecurring(db))[0].next_due).toBe(new Date(2027, 0, 5).getTime());
  });

  it('editing the schedule restarts from the next matching day', async () => {
    const db = await freshDb();
    const id = await addRecurring(db, rent, day(2026, 9, 28));
    await updateRecurring(db, id, { ...rent, amount_paise: 900_000 }, day(2026, 9, 29));
    expect((await listRecurring(db))[0]).toMatchObject({ amount_paise: 900_000, next_due: new Date(2026, 9, 5).getTime() });
    await updateRecurring(db, id, { ...rent, anchor_day: 30 }, day(2026, 9, 29));
    expect((await listRecurring(db))[0].next_due).toBe(new Date(2026, 8, 30).getTime());
    await expect(updateRecurring(db, id, { ...rent, anchor_day: 40 })).rejects.toThrow();
    await expect(addRecurring(db, { ...rent, amount_paise: 0 })).rejects.toThrow();
  });
});

describe('buckets in the database', () => {
  it('sets up from a template and keeps the invariant through spending and confirms', async () => {
    const db = await freshDb();
    const now = day(2026, 9, 10);
    await addTransaction(db, { type: 'income', account_id: 2, category_id: CATEGORY_ID.salary, amount_paise: 3_000_000, created_at: now });
    await addRecurring(db, rent, now);

    const template = BUCKET_TEMPLATES.find((t) => t.id === 'balanced')!;
    const load = async () => {
      const txs = resolveTransactions(await listTransactionRows(db));
      const reserved = reservedThisMonth(await listRecurring(db), await listPending(db), now);
      return computeMoneyPicture({
        balances: computeBalances([1, 2], txs),
        buckets: (await listAllBuckets(db)).filter((b) => b.period_month === '2026-09'),
        transactions: txs,
        reserved_paise: reserved,
      });
    };

    const before = await load();
    expect(before.reserved_paise).toBe(0); // rent's next due is 5 Oct
    const parts = splitByPercent(before.unallocated_paise, template.buckets.map((b) => b.percent));
    await createBuckets(db, '2026-09', template.buckets.map((b, i) => ({ ...b, sort_order: i, allocated_paise: parts[i] })));

    const planned = await load();
    expect(planned.unallocated_paise).toBe(0);
    expect(planned.in_buckets_paise).toBe(3_000_000);

    const ent = planned.buckets.find((b) => b.name === 'Entertainment')!;
    await addTransaction(db, { type: 'expense', account_id: 1, category_id: CATEGORY_ID.entertainment, amount_paise: 45_000, bucket_id: ent.id, created_at: now });
    const after = await load();
    expect(after.buckets.find((b) => b.id === ent.id)).toMatchObject({ spent_paise: 45_000, remaining_paise: 255_000 });
    expect(after.unallocated_paise).toBe(0);
    expect(after.in_buckets_paise + after.reserved_paise + after.unallocated_paise).toBe(after.total_paise);

    await setAllocations(db, [{ id: ent.id, allocated_paise: 200_000 }]);
    expect((await load()).unallocated_paise).toBe(100_000);
    await expect(setAllocations(db, [{ id: ent.id, allocated_paise: -1 }])).rejects.toThrow();
  });

  it('keeps each category in one bucket per month and protects used buckets', async () => {
    const db = await freshDb();
    await createBuckets(db, '2026-09', [
      { name: 'Fun', role: null, sort_order: 0, category_ids: [CATEGORY_ID.entertainment], allocated_paise: 0 },
      { name: 'Treats', role: null, sort_order: 1, category_ids: [], allocated_paise: 0 },
      { name: 'Flexible', role: 'flexible', sort_order: 2, category_ids: [], allocated_paise: 0 },
    ]);
    const [fun, treats, flexible] = await listAllBuckets(db);
    await updateBucket(db, treats.id, { name: 'Treats', category_ids: [CATEGORY_ID.entertainment, CATEGORY_ID.chai] });
    const after = await listAllBuckets(db);
    expect(after.find((b) => b.id === fun.id)?.category_ids).toEqual([]);
    expect(after.find((b) => b.id === treats.id)?.category_ids).toEqual([CATEGORY_ID.entertainment, CATEGORY_ID.chai]);

    await addTransaction(db, { type: 'expense', account_id: 1, category_id: CATEGORY_ID.chai, amount_paise: 2_000, bucket_id: treats.id });
    expect(await deleteBucketIfUnused(db, treats.id)).toBe(false);
    expect(await deleteBucketIfUnused(db, flexible.id)).toBe(false); // Flexible always stays
    expect(await deleteBucketIfUnused(db, fun.id)).toBe(true);
    await expect(createBuckets(db, '2026-09', [
      { name: 'Treats', role: null, sort_order: 5, category_ids: [], allocated_paise: 0 },
    ])).rejects.toThrow();
  });
});
