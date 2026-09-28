/**
 * App-wide state. Loads rows from SQLite and derives everything else
 * (effective transactions, balances, buckets, safe to spend) through the
 * engine. Components read from here and call actions; they never do money
 * math themselves.
 */
import { create } from 'zustand';
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
  type PendingItem,
  type RecurringInput,
} from '../db/moneyQueries';
import {
  addAccount,
  addTransaction,
  correctTransaction,
  getSetting,
  getSettingsWithPrefix,
  listAccounts,
  listCategories,
  listTransactionRows,
  renameAccount,
  setSetting,
  SETTING_LAST_ACCOUNT,
  SETTING_ROLLOVER_PREFIX,
  undoNewTransaction,
  type NewTransaction,
} from '../db/queries';
import type { Db } from '../db/types';
import {
  BUCKET_TEMPLATES,
  bucketForCategory,
  computeMoneyPicture,
  coverOverspend,
  moveBetweenBuckets,
  safeToSpend,
  splitByPercent,
  type AllocationChange,
  type Bucket,
  type BucketStatus,
  type MoneyPicture,
  type SafeToSpend,
  type TemplateId,
} from '../engine/buckets';
import { monthKey, type MonthKey } from '../engine/calendar';
import { ADJUSTMENT_CATEGORY } from '../engine/defaults';
import { balanceAdjustment, computeBalances, resolveTransactions, type CorrectionInput } from '../engine/ledger';
import type { Paise } from '../engine/money';
import { leftoverBuckets, planRollover, type RolloverChoice } from '../engine/rollover';
import { reservedThisMonth, type Recurring } from '../engine/recurring';
import type { Account, AccountType, Category, EffectiveTransaction } from '../engine/types';

export interface RolloverState {
  fromMonth: MonthKey;
  buckets: BucketStatus[];
  remembered: Map<string, RolloverChoice>;
}

interface LedgerState {
  loaded: boolean;
  month: MonthKey;
  accounts: Account[];
  categories: Category[];
  /** Newest first; includes voided entries (filter for display). */
  transactions: EffectiveTransaction[];
  balances: Map<number, Paise>;
  lastAccountId: number | null;
  allBuckets: Bucket[];
  recurring: Recurring[];
  pending: PendingItem[];
  picture: MoneyPicture;
  safe: SafeToSpend;
  rollover: RolloverState | null;
  /** A bucket that just went over plan, for the "Cover it?" card. */
  overspentBucketId: number | null;

  load: (db: Db) => Promise<void>;
  saveTransaction: (db: Db, tx: NewTransaction) => Promise<number>;
  undoNew: (db: Db, id: number) => Promise<boolean>;
  correct: (db: Db, current: EffectiveTransaction, next: CorrectionInput) => Promise<number | null>;
  setLastAccount: (db: Db, id: number) => Promise<void>;
  addAccount: (db: Db, name: string, type: AccountType) => Promise<number>;
  renameAccount: (db: Db, id: number, name: string) => Promise<void>;
  adjustBalance: (db: Db, accountId: number, actual: Paise) => Promise<number | null>;

  setupBuckets: (db: Db, template: TemplateId) => Promise<void>;
  saveAllocations: (db: Db, changes: AllocationChange[]) => Promise<AllocationChange[]>;
  moveMoney: (db: Db, fromId: number, toId: number, amount: Paise) => Promise<AllocationChange[]>;
  coverOverspend: (db: Db, overspentId: number, fromId: number) => Promise<{ amount: Paise; previous: AllocationChange[] }>;
  dismissOverspend: () => void;
  addBucket: (db: Db, name: string) => Promise<void>;
  editBucket: (db: Db, id: number, name: string, categoryIds: number[]) => Promise<void>;
  deleteBucket: (db: Db, id: number) => Promise<boolean>;
  restoreBucket: (db: Db, bucket: Bucket) => Promise<void>;
  applyRollover: (db: Db, choices: Map<number, RolloverChoice>, remember: boolean) => Promise<void>;

  addRecurring: (db: Db, input: RecurringInput) => Promise<void>;
  updateRecurring: (db: Db, id: number, input: RecurringInput) => Promise<void>;
  setRecurringActive: (db: Db, id: number, active: boolean) => Promise<void>;
  confirmPending: (db: Db, item: PendingItem, amount: Paise) => Promise<void>;
  skipPending: (db: Db, id: number) => Promise<void>;
  reopenPending: (db: Db, id: number) => Promise<boolean>;
}

const EMPTY_PICTURE: MoneyPicture = {
  total_paise: 0, reserved_paise: 0, buckets: [], in_buckets_paise: 0, unallocated_paise: 0, plan_pool_paise: 0,
};

/** Current allocations of the buckets touched by `changes`, for undo. */
function previousAllocations(buckets: readonly Bucket[], changes: readonly AllocationChange[]): AllocationChange[] {
  return changes.map((c) => ({ id: c.id, allocated_paise: buckets.find((b) => b.id === c.id)?.allocated_paise ?? 0 }));
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  loaded: false,
  month: monthKey(Date.now()),
  accounts: [],
  categories: [],
  transactions: [],
  balances: new Map(),
  lastAccountId: null,
  allBuckets: [],
  recurring: [],
  pending: [],
  picture: EMPTY_PICTURE,
  safe: { per_day_paise: 0, pool_paise: 0, days_left: 1, over_paise: 0 },
  rollover: null,
  overspentBucketId: null,

  load: async (db) => {
    const now = Date.now();
    await generatePending(db, now);
    const [accounts, categories, rows, lastRaw, allBuckets, recurring, pending, remembered] = await Promise.all([
      listAccounts(db),
      listCategories(db),
      listTransactionRows(db),
      getSetting(db, SETTING_LAST_ACCOUNT),
      listAllBuckets(db),
      listRecurring(db),
      listPending(db),
      getSettingsWithPrefix(db, SETTING_ROLLOVER_PREFIX),
    ]);
    const transactions = resolveTransactions(rows);
    const balances = computeBalances(accounts.map((a) => a.id), transactions);
    const last = lastRaw == null ? null : Number(lastRaw);
    const lastAccountId = accounts.some((a) => a.id === last) ? last : accounts[0]?.id ?? null;

    const month = monthKey(now);
    const reserved = reservedThisMonth(recurring, pending, now);
    const pictureFor = (buckets: Bucket[]) =>
      computeMoneyPicture({ balances, buckets, transactions, reserved_paise: reserved });
    const current = allBuckets.filter((b) => b.period_month === month);
    const picture = pictureFor(current);

    // New month with no buckets yet, but an earlier month had some → rollover.
    let rollover: RolloverState | null = null;
    if (current.length === 0) {
      const fromMonth = allBuckets.map((b) => b.period_month).filter((m) => m < month).sort().pop();
      if (fromMonth) {
        const previous = pictureFor(allBuckets.filter((b) => b.period_month === fromMonth)).buckets;
        const rememberedChoices = new Map(
          [...remembered].filter(([, v]) => v === 'keep' || v === 'savings' || v === 'flexible') as [string, RolloverChoice][],
        );
        const undecided = leftoverBuckets(previous).filter((b) => !rememberedChoices.has(b.name));
        if (undecided.length === 0) {
          // Every leftover has a remembered choice (or there are none): apply it.
          const choices = new Map(previous.map((b) => [b.id, rememberedChoices.get(b.name) ?? 'keep']));
          await createBuckets(db, month, planRollover(previous, choices));
          return get().load(db);
        }
        rollover = { fromMonth, buckets: previous, remembered: rememberedChoices };
      }
    }

    set({
      loaded: true,
      month,
      accounts,
      categories,
      transactions,
      balances,
      lastAccountId,
      allBuckets,
      recurring,
      pending,
      picture,
      safe: safeToSpend(picture, now),
      rollover,
    });
  },

  saveTransaction: async (db, tx) => {
    const { picture } = get();
    const bucketId =
      tx.type === 'expense' && tx.bucket_id === undefined && tx.category_id !== ADJUSTMENT_CATEGORY.id
        ? bucketForCategory(picture.buckets, tx.category_id)
        : tx.bucket_id ?? null;
    const id = await addTransaction(db, { ...tx, bucket_id: bucketId });
    await setSetting(db, SETTING_LAST_ACCOUNT, String(tx.account_id));
    await get().load(db);
    if (bucketId != null) {
      const bucket = get().picture.buckets.find((b) => b.id === bucketId);
      if (bucket && bucket.remaining_paise < 0) set({ overspentBucketId: bucketId });
    }
    return id;
  },

  undoNew: async (db, id) => {
    const removed = await undoNewTransaction(db, id);
    set({ overspentBucketId: null });
    await get().load(db);
    return removed;
  },

  correct: async (db, current, next) => {
    const id = await correctTransaction(db, current, next);
    await get().load(db);
    return id;
  },

  setLastAccount: async (db, id) => {
    set({ lastAccountId: id });
    await setSetting(db, SETTING_LAST_ACCOUNT, String(id));
  },

  addAccount: async (db, name, type) => {
    const id = await addAccount(db, name, type);
    await get().load(db);
    return id;
  },

  renameAccount: async (db, id, name) => {
    await renameAccount(db, id, name);
    await get().load(db);
  },

  adjustBalance: async (db, accountId, actual) => {
    const adjustment = balanceAdjustment(get().balances.get(accountId) ?? 0, actual);
    if (!adjustment) return null;
    const id = await addTransaction(db, {
      ...adjustment,
      account_id: accountId,
      category_id: ADJUSTMENT_CATEGORY.id,
      note: 'Balance update',
    });
    await get().load(db);
    return id;
  },

  setupBuckets: async (db, templateId) => {
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

  deleteBucket: async (db, id) => {
    const ok = await deleteBucketIfUnused(db, id);
    await get().load(db);
    return ok;
  },

  restoreBucket: async (db, bucket) => {
    await createBuckets(db, bucket.period_month, [bucket]);
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

  addRecurring: async (db, input) => {
    await addRecurring(db, input);
    await get().load(db);
  },

  updateRecurring: async (db, id, input) => {
    await updateRecurring(db, id, input);
    await get().load(db);
  },

  setRecurringActive: async (db, id, active) => {
    await setRecurringActive(db, id, active);
    await get().load(db);
  },

  confirmPending: async (db, item, amount) => {
    await confirmPending(db, item, amount);
    await get().load(db);
  },

  skipPending: async (db, id) => {
    await skipPending(db, id);
    await get().load(db);
  },

  reopenPending: async (db, id) => {
    const ok = await reopenPending(db, id);
    await get().load(db);
    return ok;
  },
}));
