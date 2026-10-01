import type { PendingItem, RecurringInput } from '../../db/moneyQueries';
import type { NewDebt } from '../../db/peopleQueries';
import type { NewTransaction } from '../../db/queries';
import type { ThemeMode } from '../../db/snapshot';
import type { Db } from '../../db/types';
import type { AllocationChange, Bucket, BucketStatus, MoneyPicture, SafeToSpend, TemplateId } from '../../engine/buckets';
import type { MonthKey } from '../../engine/calendar';
import type { ImportRow } from '../../engine/csv';
import type { DebtStatus, RepaymentPlan } from '../../engine/debts';
import type { BackupNudge } from '../../engine/backupNudge';
import type { Features } from '../../engine/features';
import type { CorrectionInput } from '../../engine/ledger';
import type { GoalStatus } from '../../engine/goals';
import type { Insight } from '../../engine/insights';
import type { Paise } from '../../engine/money';
import type { MerchantMemory } from '../../engine/parser';
import type { QuickPick } from '../../engine/quickPicks';
import type { RolloverChoice } from '../../engine/rollover';
import type { Recurring } from '../../engine/recurring';
import type { Account, AccountType, Category, EffectiveTransaction } from '../../engine/types';
import type { StoreApi } from 'zustand';

export interface RolloverState {
  fromMonth: MonthKey;
  buckets: BucketStatus[];
  remembered: Map<string, RolloverChoice>;
}

export interface LedgerState {
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
  backup: BackupNudge;
  features: Features;
  featuresChosen: boolean;
  security: { appLock: boolean; hideWidget: boolean };
  setSecurity: (db: Db, security: { appLock: boolean; hideWidget: boolean }) => Promise<void>;
  /** Save which features to show. Turning Buckets off also clears this month's plan. */
  setFeatures: (db: Db, features: Features) => Promise<void>;
  /** Put money into Savings (positive) or take it back out (negative). Returns an undo. */
  moveSavings: (db: Db, amount: Paise) => Promise<() => Promise<void>>;
  /** A backup file was just made. */
  markBackedUp: (db: Db) => Promise<void>;
  /** "Later" on the backup reminder: hide it for a week. */
  snoozeBackup: (db: Db) => Promise<void>;
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

/** One topic's actions, written against the whole store. */
export type SliceCreator<K extends keyof LedgerState> = (
  set: StoreApi<LedgerState>['setState'],
  get: StoreApi<LedgerState>['getState'],
) => Pick<LedgerState, K>;
