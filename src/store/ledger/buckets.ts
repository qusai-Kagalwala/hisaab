import { createBuckets, setAllocations, setBucketsRemoved, updateBucket } from '../../db/moneyQueries';
import { setSetting, SETTING_BUCKETS_OFF, SETTING_ROLLOVER_PREFIX } from '../../db/queries';
import { BUCKET_TEMPLATES, coverOverspend, moveBetweenBuckets, splitByPercent } from '../../engine/buckets';
import { leftoverBuckets, planRollover } from '../../engine/rollover';
import type { SliceCreator } from './types';
import { previousAllocations } from './shared';

export const bucketsActions: SliceCreator<'setupBuckets' | 'saveAllocations' | 'moveMoney' | 'coverOverspend' | 'dismissOverspend' | 'addBucket' | 'editBucket' | 'removeBuckets' | 'restoreBuckets' | 'applyRollover'> = (set, get) => ({
  setupBuckets: async (db, templateId) => {
    await setSetting(db, SETTING_BUCKETS_OFF, '0');
    const template = BUCKET_TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw new Error(`Unknown template ${templateId}`);
    const pool = Math.max(get().picture.unallocated_paise, 0);
    const parts = splitByPercent(pool, template.buckets.map((b) => b.percent));
    await createBuckets(
      db,
      get().month,
      template.buckets.map((b, i) => ({ ...b, sort_order: i, allocated_paise: parts[i] })),
    );
    await get().load(db);
  },

  saveAllocations: async (db, changes) => {
    const previous = previousAllocations(get().allBuckets, changes);
    await setAllocations(db, changes);
    await get().load(db);
    return previous;
  },

  moveMoney: async (db, fromId, toId, amount) => {
    const changes = moveBetweenBuckets(get().picture.buckets, fromId, toId, amount);
    return get().saveAllocations(db, changes);
  },

  coverOverspend: async (db, overspentId, fromId) => {
    const { amount_paise, changes } = coverOverspend(get().picture.buckets, overspentId, fromId);
    const previous = changes.length ? await get().saveAllocations(db, changes) : [];
    const stillOver = (get().picture.buckets.find((b) => b.id === overspentId)?.remaining_paise ?? 0) < 0;
    set({ overspentBucketId: stillOver ? overspentId : null });
    return { amount: amount_paise, previous };
  },

  dismissOverspend: () => set({ overspentBucketId: null }),

  addBucket: async (db, name) => {
    const { picture, month } = get();
    const nextOrder = Math.max(-1, ...picture.buckets.map((b) => b.sort_order)) + 1;
    await createBuckets(db, month, [{ name, role: null, sort_order: nextOrder, category_ids: [], allocated_paise: 0 }]);
    await get().load(db);
  },

  editBucket: async (db, id, name, categoryIds) => {
    await updateBucket(db, id, { name, category_ids: categoryIds });
    await get().load(db);
  },

  removeBuckets: async (db, ids) => {
    const all = ids == null;
    const target = ids ?? get().picture.buckets.map((b) => b.id);
    await setBucketsRemoved(db, target, true);
    if (all) await setSetting(db, SETTING_BUCKETS_OFF, '1');
    set({ overspentBucketId: null });
    await get().load(db);
    return target;
  },

  restoreBuckets: async (db, ids) => {
    await setBucketsRemoved(db, ids, false);
    await setSetting(db, SETTING_BUCKETS_OFF, '0');
    await get().load(db);
  },

  applyRollover: async (db, choices, remember) => {
    const { rollover, month } = get();
    if (!rollover) return;
    if (remember) {
      for (const b of leftoverBuckets(rollover.buckets)) {
        await setSetting(db, SETTING_ROLLOVER_PREFIX + b.name, choices.get(b.id) ?? 'keep');
      }
    }
    await createBuckets(db, month, planRollover(rollover.buckets, choices));
    await get().load(db);
  },
});
