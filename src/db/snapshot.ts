/**
 * Everything the app shows, derived from the database in one place — used
 * by the app's store and by the home-screen widget (which runs without the
 * app open). Read-only: it never writes.
 */
import {
  activeBuckets,
  computeMoneyPicture,
  safeToSpend,
  type Bucket,
  type MoneyPicture,
  type SafeToSpend,
} from '../engine/buckets';
import { monthKey, monthStartMs, shiftMonth, type MonthKey } from '../engine/calendar';
import { goalStatus, setAsideForGoals, type GoalStatus } from '../engine/goals';
import { computeInsights, everydayExpenses, spendingByCategory, type Insight } from '../engine/insights';
import { computeBalances, resolveTransactions } from '../engine/ledger';
import type { Paise } from '../engine/money';
import type { MerchantMemory } from '../engine/parser';
import { lastEntry, quickPicks, type QuickPick } from '../engine/quickPicks';
import { reservedThisMonth, type Recurring } from '../engine/recurring';
import type { Account, Category, EffectiveTransaction } from '../engine/types';
import { listAllBuckets, listPending, listRecurring, type PendingItem } from './moneyQueries';
import {
  getSetting,
  getSettingsWithPrefix,
  listAccounts,
  listCategories,
  listTransactionRows,
  SETTING_BUCKETS_OFF,
  SETTING_CAPTURE_MODE,
  SETTING_LAST_ACCOUNT,
  SETTING_ONBOARDING_DONE,
  SETTING_ROLLOVER_PREFIX,
} from './queries';
import { listContributions, listGoals, listMerchantMemory, listRecurringTransactionIds } from './smartQueries';
import type { Db } from './types';

export interface Snapshot {
  now: number;
  month: MonthKey;
  accounts: Account[];
  categories: Category[];
  transactions: EffectiveTransaction[];
  balances: Map<number, Paise>;
  lastAccountId: number | null;
  allBuckets: Bucket[];
  recurring: Recurring[];
  pending: PendingItem[];
  rememberedRollover: Map<string, string>;
  bucketsOff: boolean;
  goals: GoalStatus[];
  merchantMemory: MerchantMemory[];
  recurringTxIds: Set<number>;
  captureMode: 'keypad' | 'text';
  /** Fresh install with nothing set up yet → show first-launch setup. */
  needsOnboarding: boolean;
  picture: MoneyPicture;
  safe: SafeToSpend;
  insights: Insight[];
  quickPicks: QuickPick[];
  lastEntry: EffectiveTransaction | null;
  monthSpending: Map<number | null, Paise>;
  /** Money picture for any set of buckets (e.g. last month's, for rollover). */
  pictureFor: (buckets: Bucket[]) => MoneyPicture;
}

export async function readSnapshot(db: Db, now: number): Promise<Snapshot> {
  const [goalsRaw, contributions, merchantMemory, recurringTxIds, modeRaw, onboardedRaw] = await Promise.all([
    listGoals(db),
    listContributions(db),
    listMerchantMemory(db),
    listRecurringTransactionIds(db),
    getSetting(db, SETTING_CAPTURE_MODE),
    getSetting(db, SETTING_ONBOARDING_DONE),
  ]);
  const [accounts, categories, rows, lastRaw, allBuckets, recurring, pending, remembered, offRaw] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    listTransactionRows(db),
    getSetting(db, SETTING_LAST_ACCOUNT),
    listAllBuckets(db),
    listRecurring(db),
    listPending(db),
    getSettingsWithPrefix(db, SETTING_ROLLOVER_PREFIX),
    getSetting(db, SETTING_BUCKETS_OFF),
  ]);
  const goals = goalsRaw.map((g) => goalStatus(g, contributions, now));
  const goalsPaise = setAsideForGoals(goals);
  const transactions = resolveTransactions(rows);
  const balances = computeBalances(accounts.map((a) => a.id), transactions);
  const last = lastRaw == null ? null : Number(lastRaw);
  const lastAccountId = accounts.some((a) => a.id === last) ? last : accounts[0]?.id ?? null;
  const month = monthKey(now);
  const reserved = reservedThisMonth(recurring, pending, now);
  const pictureFor = (buckets: Bucket[]) =>
    computeMoneyPicture({ balances, buckets, transactions, reserved_paise: reserved, goals_paise: goalsPaise });
  const picture = pictureFor(activeBuckets(allBuckets, month));

  return {
    now,
    month,
    accounts,
    categories,
    transactions,
    balances,
    lastAccountId,
    allBuckets,
    recurring,
    pending,
    rememberedRollover: remembered,
    bucketsOff: offRaw === '1',
    goals,
    merchantMemory,
    recurringTxIds,
    captureMode: modeRaw === 'text' ? 'text' : 'keypad',
    needsOnboarding: onboardedRaw !== '1' && rows.length === 0 && recurring.length === 0 && allBuckets.length === 0,
    picture,
    safe: safeToSpend(picture, now),
    insights: computeInsights({ transactions, excludedIds: recurringTxIds, categories, buckets: picture.buckets, nowMs: now }),
    quickPicks: quickPicks(transactions, now, recurringTxIds),
    lastEntry: lastEntry(transactions, recurringTxIds),
    monthSpending: spendingByCategory(
      everydayExpenses(transactions, recurringTxIds), monthStartMs(month), monthStartMs(shiftMonth(month, 1)),
    ),
    pictureFor,
  };
}
