import { ADJUSTMENT_CATEGORY, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../engine/defaults';
import type { Db } from './types';

/**
 * Ordered migrations. Migration N brings the database to user_version N.
 * Never edit a shipped migration; append a new one instead.
 *
 * Conventions: money columns are INTEGER paise, timestamps are INTEGER epoch ms.
 */
const MIGRATIONS: readonly ((db: Db) => Promise<void>)[] = [
  // 1 — full schema from docs/SPEC.md §5, plus default accounts and categories.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('cash', 'upi_bank', 'other')),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income')),
        keywords_json TEXT NOT NULL DEFAULT '[]',
        is_default INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE buckets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        period_month TEXT NOT NULL,
        allocated_paise INTEGER NOT NULL CHECK (allocated_paise >= 0)
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id),
        bucket_id INTEGER REFERENCES buckets(id),
        amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
        type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'correction')),
        note TEXT,
        created_at INTEGER NOT NULL,
        corrects_id INTEGER REFERENCES transactions(id),
        CHECK ((type = 'correction') = (corrects_id IS NOT NULL))
      );
      CREATE INDEX idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX idx_transactions_corrects_id ON transactions(corrects_id);

      -- Transactions are immutable: block every UPDATE.
      CREATE TRIGGER transactions_no_update BEFORE UPDATE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'transactions are immutable; add a correction instead');
      END;

      CREATE TABLE recurring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        category_id INTEGER REFERENCES categories(id),
        rule TEXT NOT NULL CHECK (rule IN ('monthly', 'weekly', 'custom')),
        next_due INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE pending_recurring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recurring_id INTEGER NOT NULL REFERENCES recurring(id),
        due_date INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'skipped'))
      );

      CREATE TABLE goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_paise INTEGER NOT NULL CHECK (target_paise > 0),
        target_date INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE goal_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL REFERENCES goals(id),
        amount_paise INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE merchant_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text_pattern TEXT NOT NULL UNIQUE,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        hit_count INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    const now = Date.now();
    for (const a of DEFAULT_ACCOUNTS) {
      await db.runAsync(
        'INSERT INTO accounts (id, name, type, created_at) VALUES (?, ?, ?, ?)',
        a.id, a.name, a.type, now,
      );
    }
    for (const c of DEFAULT_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO categories (id, name, icon, kind, keywords_json, is_default) VALUES (?, ?, ?, ?, ?, 1)',
        c.id, c.name, c.icon, c.kind, JSON.stringify(c.keywords),
      );
    }
  },

  // 2 — money model: bucket roles and category lists, recurring names and
  // anchor days, pending ↔ transaction link, hidden Balance update category.
  async (db) => {
    await db.execAsync(`
      ALTER TABLE buckets ADD COLUMN role TEXT CHECK (role IN ('flexible', 'savings'));
      ALTER TABLE buckets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE buckets ADD COLUMN categories_json TEXT NOT NULL DEFAULT '[]';
      CREATE UNIQUE INDEX idx_buckets_month_name ON buckets(period_month, name);

      ALTER TABLE recurring ADD COLUMN name TEXT NOT NULL DEFAULT '';
      ALTER TABLE recurring ADD COLUMN anchor_day INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE pending_recurring ADD COLUMN transaction_id INTEGER REFERENCES transactions(id);
      CREATE UNIQUE INDEX idx_pending_unique ON pending_recurring(recurring_id, due_date);

      ALTER TABLE categories ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
    `);
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, kind, keywords_json, is_default, hidden)
       VALUES (?, ?, ?, 'expense', '[]', 1, 1)`,
      ADJUSTMENT_CATEGORY.id, ADJUSTMENT_CATEGORY.name, ADJUSTMENT_CATEGORY.icon,
    );
  },

  // 3 — buckets can be removed (hidden) even after money was spent from them.
  async (db) => {
    await db.execAsync('ALTER TABLE buckets ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;');
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

/** Bring the database up to date. Safe to call on every app start. */
export async function migrate(db: Db, targetVersion = LATEST_SCHEMA_VERSION): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version > LATEST_SCHEMA_VERSION) {
    throw new Error(`Database version ${version} is newer than this app (${LATEST_SCHEMA_VERSION})`);
  }
  while (version < targetVersion) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[version](db);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
