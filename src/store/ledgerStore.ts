/**
 * App-wide state. Loads rows from SQLite and derives everything else
 * (effective transactions, balances, buckets, safe to spend) through the
 * engine. Components read from here and call actions; they never do money
 * math themselves.
 */
import { create } from 'zustand';
import { createBuckets, generatePending } from '../db/moneyQueries';
import {
  addTransaction,
  correctTransaction,
  setSetting,
  SETTING_BACKUP_SNOOZE,
  SETTING_CAPTURE_MODE,
  SETTING_LAST_ACCOUNT,
  SETTING_LAST_BACKUP,
  SETTING_ONBOARDING_DONE,
  SETTING_THEME,
  undoNewTransaction,
} from '../db/queries';
import { learnMerchant } from '../db/smartQueries';
import { readSnapshot } from '../db/snapshot';
import type { Db } from '../db/types';
import { activeBuckets, bucketForCategory, type MoneyPicture } from '../engine/buckets';
import { monthKey } from '../engine/calendar';
import { snoozeUntil } from '../engine/backupNudge';
import { ADJUSTMENT_CATEGORY } from '../engine/defaults';
import { leftoverBuckets, planRollover, rolloverSource, type RolloverChoice } from '../engine/rollover';
import { useThemeStore } from './themeStore';
import { accountsActions } from './ledger/accounts';
import { bucketsActions } from './ledger/buckets';
import { goalsActions } from './ledger/goals';
import { peopleActions } from './ledger/people';
import { recurringActions } from './ledger/recurring';
import type { LedgerState, RolloverState } from './ledger/types';

export type { RolloverState } from './ledger/types';

const EMPTY_PICTURE: MoneyPicture = {
  total_paise: 0, reserved_paise: 0, repayments_paise: 0, goals_paise: 0, buckets: [], in_buckets_paise: 0, unallocated_paise: 0, plan_pool_paise: 0,
};

/** Hook for side effects after every reload (e.g. refreshing the home-screen widget). */
let onLedgerChanged: ((db: Db) => void) | null = null;
export function setOnLedgerChanged(fn: (db: Db) => void): void {
  onLedgerChanged = fn;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  loaded: false,
  month: monthKey(Date.now()),
  accounts: [],
  allAccounts: [],
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
  bucketsOff: false,
  goals: [],
  debts: [],
  theme: 'system',
  backup: { show: false, days_since: null },
  merchantMemory: [],
  insights: [],
  quickPicks: [],
  lastEntry: null,
  monthSpending: new Map(),
  captureMode: 'keypad',
  needsOnboarding: false,
  recurringTxIds: new Set(),
  load: async (db) => {
    const now = Date.now();
    await generatePending(db, now);
    const snap = await readSnapshot(db, now);

    // New month with no buckets yet, but an earlier month had some → rollover.
    let rollover: RolloverState | null = null;
    const fromMonth = rolloverSource(snap.allBuckets, snap.month);
    if (fromMonth) {
      const previous = snap.pictureFor(activeBuckets(snap.allBuckets, fromMonth)).buckets;
      const rememberedChoices = new Map(
        [...snap.rememberedRollover].filter(([, v]) => v === 'keep' || v === 'savings' || v === 'flexible') as [
          string,
          RolloverChoice,
        ][],
      );
      const undecided = leftoverBuckets(previous).filter((b) => !rememberedChoices.has(b.name));
      if (undecided.length === 0) {
        // Every leftover has a remembered choice (or there are none): apply it.
        const choices = new Map(previous.map((b) => [b.id, rememberedChoices.get(b.name) ?? 'keep']));
        await createBuckets(db, snap.month, planRollover(previous, choices));
        return get().load(db);
      }
      rollover = { fromMonth, buckets: previous, remembered: rememberedChoices };
    }

    const { pictureFor: _pictureFor, rememberedRollover: _remembered, now: _now, ...state } = snap;
    if (useThemeStore.getState().mode !== snap.theme) useThemeStore.getState().apply(snap.theme);
    set({ ...state, loaded: true, rollover });
    onLedgerChanged?.(db);
  },
  saveTransaction: async (db, tx, options) => {
    const { picture } = get();
    const bucketId =
      tx.type === 'expense' && tx.bucket_id === undefined && tx.category_id !== ADJUSTMENT_CATEGORY.id
        ? bucketForCategory(picture.buckets, tx.category_id)
        : tx.bucket_id ?? null;
    const id = await addTransaction(db, { ...tx, bucket_id: bucketId });
    await setSetting(db, SETTING_LAST_ACCOUNT, String(tx.account_id));
    if (options?.learn && tx.note && tx.category_id != null) await learnMerchant(db, tx.note, tx.category_id);
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
    // Changing the category of a noted entry teaches the parser.
    const note = next.note?.trim() || current.note;
    if (id != null && note && next.category_id != null && next.category_id !== current.category_id) {
      await learnMerchant(db, note, next.category_id);
    }
    await get().load(db);
    return id;
  },
  finishOnboarding: async (db) => {
    await setSetting(db, SETTING_ONBOARDING_DONE, '1');
    set({ needsOnboarding: false });
  },
  setCaptureMode: async (db, mode) => {
    set({ captureMode: mode });
    await setSetting(db, SETTING_CAPTURE_MODE, mode);
  },
  setLastAccount: async (db, id) => {
    set({ lastAccountId: id });
    await setSetting(db, SETTING_LAST_ACCOUNT, String(id));
  },
  importRows: async (db, rows, accountId) => {
    const { picture, month } = get();
    const ids: number[] = [];
    await db.withTransactionAsync(async () => {
      for (const r of rows) {
        // Only this month's spending draws from this month's buckets.
        const bucketId = r.type === 'expense' && monthKey(r.occurred_at) === month
          ? bucketForCategory(picture.buckets, r.category_id)
          : null;
        ids.push(await addTransaction(db, {
          type: r.type, account_id: accountId, category_id: r.category_id, amount_paise: r.amount_paise,
          note: r.note, created_at: r.occurred_at, bucket_id: bucketId,
        }));
      }
    });
    await get().load(db);
    return ids;
  },
  undoImport: async (db, ids) => {
    await db.withTransactionAsync(async () => {
      for (const id of ids) await undoNewTransaction(db, id);
    });
    await get().load(db);
  },
  markBackedUp: async (db) => {
    await setSetting(db, SETTING_LAST_BACKUP, String(Date.now()));
    await get().load(db);
  },
  snoozeBackup: async (db) => {
    await setSetting(db, SETTING_BACKUP_SNOOZE, String(snoozeUntil(Date.now())));
    await get().load(db);
  },
  setTheme: async (db, mode) => {
    useThemeStore.getState().apply(mode);
    set({ theme: mode });
    await setSetting(db, SETTING_THEME, mode);
  },

  ...accountsActions(set, get),
  ...peopleActions(set, get),
  ...goalsActions(set, get),
  ...bucketsActions(set, get),
  ...recurringActions(set, get),
}));
