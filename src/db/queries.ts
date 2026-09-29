/**
 * Thin data access. No business rules here: ledger logic lives in
 * src/engine/ledger.ts and callers compose the two.
 */
import { buildCorrection, type CorrectionInput } from '../engine/ledger';
import { assertPaise, type Paise } from '../engine/money';
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  EffectiveTransaction,
  TransactionRow,
} from '../engine/types';
import type { Db } from './types';

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** All accounts, removed ones included (flagged `archived`). */
export async function listAccounts(db: Db): Promise<Account[]> {
  const rows = await db.getAllAsync<Omit<Account, 'archived'> & { archived: number }>(
    'SELECT id, name, type, created_at, archived FROM accounts ORDER BY id',
  );
  return rows.map((r) => ({ ...r, archived: r.archived === 1 }));
}

export async function setAccountArchived(db: Db, id: number, archived: boolean): Promise<void> {
  await db.runAsync('UPDATE accounts SET archived = ? WHERE id = ?', archived ? 1 : 0, id);
}

export async function addAccount(db: Db, name: string, type: AccountType): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Account name is required');
  const result = await db.runAsync(
    'INSERT INTO accounts (name, type, created_at) VALUES (?, ?, ?)',
    trimmed, type, Date.now(),
  );
  return result.lastInsertRowId;
}

export async function renameAccount(db: Db, id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Account name is required');
  await db.runAsync('UPDATE accounts SET name = ? WHERE id = ?', trimmed, id);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: number;
  name: string;
  icon: string;
  kind: CategoryKind;
  keywords_json: string;
  is_default: number;
  hidden: number;
}

export async function listCategories(db: Db): Promise<Category[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT id, name, icon, kind, keywords_json, is_default, hidden FROM categories ORDER BY id',
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    kind: r.kind,
    keywords: JSON.parse(r.keywords_json) as string[],
    is_default: r.is_default === 1,
    hidden: r.hidden === 1,
  }));
}

// ---------------------------------------------------------------------------
// Transactions (append-only)
// ---------------------------------------------------------------------------

export interface NewTransaction {
  type: 'expense' | 'income';
  account_id: number;
  category_id: number | null;
  amount_paise: Paise;
  note?: string | null;
  created_at?: number;
  bucket_id?: number | null;
}

export async function addTransaction(db: Db, tx: NewTransaction): Promise<number> {
  assertPaise(tx.amount_paise);
  if (tx.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  const result = await db.runAsync(
    `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    tx.account_id, tx.category_id, tx.bucket_id ?? null, tx.amount_paise, tx.type,
    tx.note?.trim() || null, tx.created_at ?? Date.now(),
  );
  return result.lastInsertRowId;
}

export function listTransactionRows(db: Db): Promise<TransactionRow[]> {
  return db.getAllAsync<TransactionRow>(
    `SELECT id, account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id,
            to_account_id, debt_id, direction
     FROM transactions ORDER BY id`,
  );
}

export interface NewTransfer {
  account_id: number;
  amount_paise: Paise;
  /** Between your accounts… */
  to_account_id?: number | null;
  /** …or with a person (borrow & lend). */
  debt_id?: number | null;
  direction?: 'in' | 'out' | null;
  note?: string | null;
  created_at?: number;
}

/** Money moving without being spending or income. */
export async function addTransfer(db: Db, t: NewTransfer): Promise<number> {
  assertPaise(t.amount_paise);
  if (t.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  const toAccount = t.to_account_id ?? null;
  const debt = t.debt_id ?? null;
  if ((toAccount == null) === (debt == null)) throw new Error('A transfer goes to an account or a person');
  if (toAccount === t.account_id) throw new Error('Pick two different accounts');
  if (debt != null && t.direction !== 'in' && t.direction !== 'out') throw new Error('Say which way the money went');
  const result = await db.runAsync(
    `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id,
                               to_account_id, debt_id, direction)
     VALUES (?, NULL, NULL, ?, 'transfer', ?, ?, NULL, ?, ?, ?)`,
    t.account_id, t.amount_paise, t.note?.trim() || null, t.created_at ?? Date.now(),
    toAccount, debt, debt != null ? t.direction! : null,
  );
  return result.lastInsertRowId;
}

/**
 * Append a correction for `current`. Returns the new row id, or null when
 * nothing changed. Pass amount_paise 0 to delete the entry.
 */
export async function correctTransaction(
  db: Db,
  current: EffectiveTransaction,
  next: CorrectionInput,
): Promise<number | null> {
  const correction = buildCorrection(current, next);
  if (!correction) return null;
  const result = await db.runAsync(
    `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id,
                               to_account_id, debt_id, direction)
     VALUES (?, ?, ?, ?, 'correction', ?, ?, ?, ?, ?, ?)`,
    correction.account_id, correction.category_id, correction.bucket_id,
    correction.amount_paise, correction.note, Date.now(), correction.corrects_id,
    correction.to_account_id, correction.debt_id, correction.direction ?? null,
  );
  return result.lastInsertRowId;
}

/**
 * Undo, used only inside the 5-second undo window right after saving.
 * Removes the just-created row entirely, and refuses if it has already been
 * corrected (then it is part of the ledger's history and must stay).
 */
export async function undoNewTransaction(db: Db, id: number): Promise<boolean> {
  const result = await db.runAsync(
    `DELETE FROM transactions
     WHERE id = ? AND type != 'correction'
       AND NOT EXISTS (SELECT 1 FROM transactions c WHERE c.corrects_id = ?)`,
    id, id,
  );
  return result.changes === 1;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

export async function getSettingsWithPrefix(db: Db, prefix: string): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE substr(key, 1, length(?)) = ?", prefix, prefix,
  );
  return new Map(rows.map((r) => [r.key.slice(prefix.length), r.value]));
}

export const SETTING_LAST_ACCOUNT = 'last_account_id';
/** '1' once first-launch setup was finished or skipped. */
export const SETTING_ONBOARDING_DONE = 'onboarding_done';
/** '1' after the user turned buckets off (stop suggesting them). */
export const SETTING_BUCKETS_OFF = 'buckets_off';
/** Epoch ms of the last backup export. */
export const SETTING_LAST_BACKUP = 'last_backup_at';
/** Epoch ms until which the backup reminder stays hidden. */
export const SETTING_BACKUP_SNOOZE = 'backup_snooze_until';
/** 'system' (default), 'light' or 'dark'. */
export const SETTING_THEME = 'theme';
/** 'keypad' (default) or 'text' — how the capture screen opens. */
export const SETTING_CAPTURE_MODE = 'capture_mode';
/** Remembered month-end choice per bucket name: `rollover:<name>` → keep|savings|flexible. */
export const SETTING_ROLLOVER_PREFIX = 'rollover:';
