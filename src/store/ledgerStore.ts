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
  generatePending,
  reopenPending,
  setAllocations,
  setBucketsRemoved,
  setRecurringActive,
  skipPending,
  updateBucket,
  updateRecurring,
  type PendingItem,
  type RecurringInput,
} from '../db/moneyQueries';
import {
  addDebt,
  addDebtPayment,
  moveRecurringToAccount,
  setRecurringAccount,
  undoNewDebt,
  updateDebtPlan,
  type NewDebt,
} from '../db/peopleQueries';
import {
  addAccount,
  addTransaction,
  addTransfer,
  correctTransaction,
  renameAccount,
  setAccountArchived,
  setSetting,
  SETTING_THEME,
  SETTING_BUCKETS_OFF,
  SETTING_CAPTURE_MODE,
  SETTING_LAST_ACCOUNT,
  SETTING_ONBOARDING_DONE,
  SETTING_ROLLOVER_PREFIX,
  undoNewTransaction,
  type NewTransaction,
} from '../db/queries';
import {
  addContribution,
  addGoal,
  deleteContribution,
  learnMerchant,
  setGoalStatus,
  updateGoal,
} from '../db/smartQueries';
import { readSnapshot, type ThemeMode } from '../db/snapshot';
import type { Db } from '../db/types';
import {
  activeBuckets,
  BUCKET_TEMPLATES,
  bucketForCategory,
  coverOverspend,
  moveBetweenBuckets,
  splitByPercent,
  type AllocationChange,
  type Bucket,
  type BucketStatus,
  type MoneyPicture,
  type SafeToSpend,
  type TemplateId,
} from '../engine/buckets';
import { monthKey, type MonthKey } from '../engine/calendar';
import type { ImportRow } from '../engine/csv';
import type { DebtStatus, RepaymentPlan } from '../engine/debts';
import { ADJUSTMENT_CATEGORY } from '../engine/defaults';
import { balanceAdjustment, type CorrectionInput } from '../engine/ledger';
import { splitContribution, type GoalStatus } from '../engine/goals';
import type { Insight } from '../engine/insights';
import type { Paise } from '../engine/money';
import type { MerchantMemory } from '../engine/parser';
import type { QuickPick } from '../engine/quickPicks';
import { leftoverBuckets, planRollover, rolloverSource, type RolloverChoice } from '../engine/rollover';
import type { Recurring } from '../engine/recurring';
import type { Account, AccountType, Category, EffectiveTransaction } from '../engine/types';
import { useThemeStore } from './themeStore';

export interface RolloverState {
  fromMonth: MonthKey;
  buckets: BucketStatus[];
  remembered: Map<string, RolloverChoice>;
}

interface LedgerState {
  loaded: boolean;
  month: MonthKey;
  /** Accounts in use (pickers, lists). */
  accounts: Account[];
  /** Every account incl. removed ones (to name old entries). */
  allAccounts: Account[];
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
  goals: GoalStatus[];
  /** Borrow & lend (settled ones included). */
  debts: DebtStatus[];
  theme: ThemeMode;
  setTheme: (db: Db, mode: ThemeMode) => Promise<void>;
  merchantMemory: MerchantMemory[];
  insights: Insight[];
  quickPicks: QuickPick[];
  lastEntry: EffectiveTransaction | null;
  /** Everyday spending this month by category (for chat). */
  monthSpending: Map<number | null, Paise>;
  captureMode: 'keypad' | 'text';
  needsOnboarding: boolean;
  finishOnboarding: (db: Db) => Promise<void>;
  /** Transactions from confirmed bills/income (left out of everyday stats). */
  recurringTxIds: Set<number>;

  load: (db: Db) => Promise<void>;
  /** `learn`: remember note → category (text entries). */
  saveTransaction: (db: Db, tx: NewTransaction, options?: { learn?: boolean }) => Promise<number>;
  setCaptureMode: (db: Db, mode: 'keypad' | 'text') => Promise<void>;
  addGoal: (db: Db, goal: { name: string; target_paise: Paise; target_date: number | null }) => Promise<number>;
  updateGoal: (db: Db, id: number, goal: { name: string; target_paise: Paise; target_date: number | null }) => Promise<void>;
  /** Put money into a goal (Savings bucket first, then free money). Returns an undo. */
  contributeToGoal: (db: Db, goalId: number, amount: Paise) => Promise<() => Promise<void>>;
  /** Finish ("done — use the money") or remove a goal; its money is released. Returns an undo. */
  closeGoal: (db: Db, goalId: number, status: 'done' | 'removed') => Promise<() => Promise<void>>;
  undoNew: (db: Db, id: number) => Promise<boolean>;
  correct: (db: Db, current: EffectiveTransaction, next: CorrectionInput) => Promise<number | null>;
  setLastAccount: (db: Db, id: number) => Promise<void>;
  addAccount: (db: Db, name: string, type: AccountType) => Promise<number>;
  renameAccount: (db: Db, id: number, name: string) => Promise<void>;
  adjustBalance: (db: Db, accountId: number, actual: Paise) => Promise<number | null>;
  /**
   * Remove an account. Money still in it moves to `moveTo`, or (moveTo null)
   * is written off with a balance update. Bills/income move along. Returns an undo.
   */
  removeAccount: (db: Db, id: number, moveTo: number | null) => Promise<() => Promise<void>>;
  restoreAccount: (db: Db, id: number) => Promise<void>;

  /** Move money between two of your accounts. */
  transfer: (db: Db, fromId: number, toId: number, amount: Paise, note?: string | null) => Promise<number>;
  recordDebt: (db: Db, debt: NewDebt) => Promise<{ debtId: number; txId: number }>;
  undoDebt: (db: Db, debtId: number) => Promise<boolean>;
  /** Repay (borrowed) or get back (lent) — always a user tap, never automatic. */
  settleDebt: (db: Db, debt: DebtStatus, amount: Paise, accountId: number) => Promise<number>;
  changeDebtPlan: (db: Db, debt: DebtStatus, plan: RepaymentPlan, firstDue: number | null) => Promise<void>;
  /** Save reviewed import rows into one account. Returns the new ids (for undo). */
  importRows: (db: Db, rows: readonly ImportRow[], accountId: number) => Promise<number[]>;
  undoImport: (db: Db, ids: readonly number[]) => Promise<void>;

  setupBuckets: (db: Db, template: TemplateId) => Promise<void>;
  saveAllocations: (db: Db, changes: AllocationChange[]) => Promise<AllocationChange[]>;
  moveMoney: (db: Db, fromId: number, toId: number, amount: Paise) => Promise<AllocationChange[]>;
  coverOverspend: (db: Db, overspentId: number, fromId: number) => Promise<{ amount: Paise; previous: AllocationChange[] }>;
  dismissOverspend: () => void;
  addBucket: (db: Db, name: string) => Promise<void>;
  editBucket: (db: Db, id: number, name: string, categoryIds: number[]) => Promise<void>;
  /** Remove buckets (all of this month's when `ids` is omitted = buckets off). Returns what was removed. */
  removeBuckets: (db: Db, ids?: number[]) => Promise<number[]>;
  restoreBuckets: (db: Db, ids: number[]) => Promise<void>;
  /** The user turned buckets off: stop suggesting them. */
  bucketsOff: boolean;
  applyRollover: (db: Db, choices: Map<number, RolloverChoice>, remember: boolean) => Promise<void>;

  addRecurring: (db: Db, input: RecurringInput) => Promise<void>;
  updateRecurring: (db: Db, id: number, input: RecurringInput) => Promise<void>;
  setRecurringActive: (db: Db, id: number, active: boolean) => Promise<void>;
  confirmPending: (db: Db, item: PendingItem, amount: Paise) => Promise<void>;
  skipPending: (db: Db, id: number) => Promise<void>;
  reopenPending: (db: Db, id: number) => Promise<boolean>;
}

const EMPTY_PICTURE: MoneyPicture = {
  total_paise: 0, reserved_paise: 0, repayments_paise: 0, goals_paise: 0, buckets: [], in_buckets_paise: 0, unallocated_paise: 0, plan_pool_paise: 0,
};

/** Current allocations of the buckets touched by `changes`, for undo. */
function previousAllocations(buckets: readonly Bucket[], changes: readonly AllocationChange[]): AllocationChange[] {
  return changes.map((c) => ({ id: c.id, allocated_paise: buckets.find((b) => b.id === c.id)?.allocated_paise ?? 0 }));
}

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

  addGoal: async (db, goal) => {
    const id = await addGoal(db, goal);
    await get().load(db);
    return id;
  },

  updateGoal: async (db, id, goal) => {
    await updateGoal(db, id, goal);
    await get().load(db);
  },

  contributeToGoal: async (db, goalId, amount) => {
    const { picture, allBuckets } = get();
    const savings = picture.buckets.find((b) => b.role === 'savings');
    const { fromSavings } = splitContribution(amount, savings?.remaining_paise ?? 0, picture.unallocated_paise);
    const change = savings && fromSavings > 0 ? [{ id: savings.id, allocated_paise: savings.allocated_paise - fromSavings }] : [];
    const previous = previousAllocations(allBuckets, change);
    if (change.length) await setAllocations(db, change);
    const contributionId = await addContribution(db, goalId, amount);
    await get().load(db);
    return async () => {
      await deleteContribution(db, contributionId);
      if (previous.length) await setAllocations(db, previous);
      await get().load(db);
    };
  },

  closeGoal: async (db, goalId, status) => {
    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) throw new Error('Goal not found');
    const releaseId = goal.saved_paise !== 0 ? await addContribution(db, goalId, -goal.saved_paise) : null;
    await setGoalStatus(db, goalId, status);
    await get().load(db);
    return async () => {
      if (releaseId != null) await deleteContribution(db, releaseId);
      await setGoalStatus(db, goalId, 'active');
      await get().load(db);
    };
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

  removeAccount: async (db, id, moveTo) => {
    const { accounts, balances } = get();
    const account = accounts.find((a) => a.id === id);
    if (!account) throw new Error('Account not found');
    const others = accounts.filter((a) => a.id !== id);
    if (others.length === 0) throw new Error('Keep at least one account');
    if (moveTo != null && !others.some((a) => a.id === moveTo)) throw new Error('Pick another account');
    const balance = balances.get(id) ?? 0;
    let txId: number | null = null;
    if (balance !== 0 && moveTo != null) {
      txId = await addTransfer(db, {
        account_id: balance > 0 ? id : moveTo,
        to_account_id: balance > 0 ? moveTo : id,
        amount_paise: Math.abs(balance),
        note: `Moved when ${account.name} was removed`,
      });
    } else if (balance !== 0) {
      txId = await addTransaction(db, {
        ...balanceAdjustment(balance, 0)!,
        account_id: id,
        category_id: ADJUSTMENT_CATEGORY.id,
        note: 'Balance update',
      });
    }
    const movedRecurring = await moveRecurringToAccount(db, id, moveTo ?? others[0].id);
    await setAccountArchived(db, id, true);
    await get().load(db);
    return async () => {
      await setAccountArchived(db, id, false);
      await setRecurringAccount(db, movedRecurring, id);
      if (txId != null) await undoNewTransaction(db, txId);
      await get().load(db);
    };
  },

  restoreAccount: async (db, id) => {
    await setAccountArchived(db, id, false);
    await get().load(db);
  },

  transfer: async (db, fromId, toId, amount, note) => {
    const id = await addTransfer(db, { account_id: fromId, to_account_id: toId, amount_paise: amount, note });
    await get().load(db);
    return id;
  },

  recordDebt: async (db, debt) => {
    const ids = await addDebt(db, debt);
    await setSetting(db, SETTING_LAST_ACCOUNT, String(debt.account_id));
    await get().load(db);
    return ids;
  },

  undoDebt: async (db, debtId) => {
    const ok = await undoNewDebt(db, debtId);
    await get().load(db);
    return ok;
  },

  settleDebt: async (db, debt, amount, accountId) => {
    if (amount > debt.outstanding_paise) throw new Error('That is more than what is left');
    const id = await addDebtPayment(db, debt, amount, accountId);
    await get().load(db);
    return id;
  },

  changeDebtPlan: async (db, debt, plan, firstDue) => {
    await updateDebtPlan(db, debt.id, debt.principal_paise, plan, firstDue);
    await get().load(db);
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

  setTheme: async (db, mode) => {
    useThemeStore.getState().apply(mode);
    set({ theme: mode });
    await setSetting(db, SETTING_THEME, mode);
  },

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
