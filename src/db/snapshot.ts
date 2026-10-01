/**
 * Everything the app shows, derived from the database in one place — used
 * by the app's store and by the home-screen widget (which runs without the
 * app open). Read-only: it never writes.
 */
import { backupNudge, type BackupNudge } from '../engine/backupNudge';
import {
  activeBuckets,
  computeMoneyPicture,
  moneyAddsUp,
  safeToSpend,
  type Bucket,
  type MoneyPicture,
  type SafeToSpend,
} from '../engine/buckets';
import { monthKey, monthStartMs, shiftMonth, type MonthKey } from '../engine/calendar';
import { readFeatures, type Features } from '../engine/features';
import { debtStatus, repaymentsThisMonth, type DebtStatus } from '../engine/debts';
import { goalStatus, setAsideForGoals, type GoalStatus } from '../engine/goals';
import { computeInsights, everydayExpenses, spendingByCategory, type Insight } from '../engine/insights';
import { computeBalances } from '../engine/ledger';
import { loadLedger } from './ledgerCache';
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
  SETTING_BACKUP_SNOOZE,
  SETTING_BUCKETS_OFF,
  SETTING_LAST_BACKUP,
  SETTING_CAPTURE_MODE,
  SETTING_APP_LOCK,
  SETTING_FEATURES,
  SETTING_LAST_ACCOUNT,
  SETTING_ONBOARDING_DONE,
  SETTING_ROLLOVER_PREFIX,
  SETTING_THEME,
  SETTING_WIDGET_HIDE,
} from './queries';
import { listDebts } from './peopleQueries';
import { savingsBalance } from './savingsQueries';
import { listContributions, listGoals, listMerchantMemory, listRecurringTransactionIds } from './smartQueries';
import type { Db } from './types';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Snapshot {
  now: number;
  month: MonthKey;
  /** Accounts in use (removed ones left out) — for pickers and totals lists. */
  accounts: Account[];
  /** Every account, removed ones included — for naming old entries. */
  allAccounts: Account[];
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
  /** Borrow & lend, with what's owed and what's due (all of them, incl. settled). */
  debts: DebtStatus[];
  theme: ThemeMode;
  /** What the user chose to see (logging is always on). */
  features: Features;
  /** False until the user has picked features once (then the picker shows). */
  featuresChosen: boolean;
  /** App lock on, and whether the widget hides amounts while it is. */
  security: { appLock: boolean; hideWidget: boolean };
  /** "Back up now?" reminder on Home. */
  backup: BackupNudge;
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
  const [goalsRaw, contributions, merchantMemory, recurringTxIds, modeRaw, onboardedRaw, debtsRaw, themeRaw] = await Promise.all([
    listGoals(db),
    listContributions(db),
    listMerchantMemory(db),
    listRecurringTransactionIds(db),
    getSetting(db, SETTING_CAPTURE_MODE),
    getSetting(db, SETTING_ONBOARDING_DONE),
    listDebts(db),
    getSetting(db, SETTING_THEME),
  ]);
  const [lastBackupRaw, snoozeRaw, featuresRaw, aiRaw, savingsPaise, lockRaw, hideRaw] = await Promise.all([
    getSetting(db, SETTING_LAST_BACKUP),
    getSetting(db, SETTING_BACKUP_SNOOZE),
    getSetting(db, SETTING_FEATURES),
    getSetting(db, 'ai_enabled'),
    savingsBalance(db),
    getSetting(db, SETTING_APP_LOCK),
    getSetting(db, SETTING_WIDGET_HIDE),
  ]);
  const [allAccounts, categories, ledger, lastRaw, allBuckets, recurring, pending, remembered, offRaw] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    loadLedger(db, typeof __DEV__ !== 'undefined' && __DEV__),
    getSetting(db, SETTING_LAST_ACCOUNT),
    listAllBuckets(db),
    listRecurring(db),
    listPending(db),
    getSettingsWithPrefix(db, SETTING_ROLLOVER_PREFIX),
    getSetting(db, SETTING_BUCKETS_OFF),
  ]);
  const goals = goalsRaw.map((g) => goalStatus(g, contributions, now));
  const goalsPaise = setAsideForGoals(goals);
  const transactions = ledger.list;
  const balances = computeBalances(allAccounts.map((a) => a.id), transactions);
  const accounts = allAccounts.filter((a) => !a.archived);
  // Group borrow/lend entries once instead of scanning the ledger per person.
  const byDebt = new Map<number, EffectiveTransaction[]>();
  for (const t of transactions) {
    if (t.debt_id == null) continue;
    const list = byDebt.get(t.debt_id);
    if (list) list.push(t);
    else byDebt.set(t.debt_id, [t]);
  }
  const debts = debtsRaw.map((d) => debtStatus(d, byDebt.get(d.id) ?? [], now));
  const repayments = repaymentsThisMonth(debts);
  const last = lastRaw == null ? null : Number(lastRaw);
  const lastAccountId = accounts.some((a) => a.id === last) ? last : accounts[0]?.id ?? null;
  const month = monthKey(now);
  const reserved = reservedThisMonth(recurring, pending, now);
  const pictureFor = (buckets: Bucket[]) =>
    computeMoneyPicture({
      balances, buckets, transactions, reserved_paise: reserved, repayments_paise: repayments, savings_paise: savingsPaise,
      goals_paise: goalsPaise,
    });
  const picture = pictureFor(activeBuckets(allBuckets, month));
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !moneyAddsUp(picture)) {
    console.error('Hisaab: money picture does not add up to the account totals', picture);
  }

  return {
    now,
    month,
    accounts,
    allAccounts,
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
    debts,
    theme: themeRaw === 'light' || themeRaw === 'dark' ? themeRaw : 'system',
    ...(() => {
      const { features, chosen } = readFeatures(featuresRaw, {
        hasGoals: goals.some((g) => g.status === 'active'),
        hasDebts: debtsRaw.length > 0,
        hasBuckets: activeBuckets(allBuckets, month).length > 0,
        hasRecurring: recurring.some((r) => r.active),
        aiOn: aiRaw === '1',
      });
      return { features, featuresChosen: chosen };
    })(),
    security: { appLock: lockRaw === '1', hideWidget: lockRaw === '1' && hideRaw !== '0' },
    backup: backupNudge({
      nowMs: now,
      lastBackupAt: lastBackupRaw == null ? null : Number(lastBackupRaw),
      firstEntryAt: transactions.length ? transactions[transactions.length - 1].occurred_at : null, // list is newest first
      snoozedUntil: snoozeRaw == null ? null : Number(snoozeRaw),
    }),
    merchantMemory,
    recurringTxIds,
    captureMode: modeRaw === 'text' ? 'text' : 'keypad',
    needsOnboarding:
      onboardedRaw !== '1' && ledger.originals.size === 0 && recurring.length === 0 && allBuckets.length === 0 && debtsRaw.length === 0,
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
