/**
 * Backup format: a plain JSON copy of every table. Validated before any
 * import so a broken or foreign file can never half-overwrite the ledger.
 * The Gemini API key is NOT included (it lives in secure storage).
 */
import { isPaise } from './money';

export const BACKUP_APP = 'hisaab';
export const BACKUP_FORMAT = 1;

/** Import order respects foreign keys; delete in reverse. */
export const BACKUP_TABLES = [
  'accounts',
  'categories',
  'buckets',
  'debts',
  'transactions',
  'recurring',
  'pending_recurring',
  'goals',
  'goal_contributions',
  'merchant_memory',
  'chat_history',
  'settings',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type Row = Record<string, string | number | null>;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  schema_version: number;
  exported_at: number;
  tables: Record<BackupTable, Row[]>;
}

/** Columns that hold money: must be integer paise. */
const MONEY_COLUMNS: Partial<Record<BackupTable, string[]>> = {
  transactions: ['amount_paise'],
  buckets: ['allocated_paise'],
  recurring: ['amount_paise'],
  goals: ['target_paise'],
  goal_contributions: ['amount_paise'],
  debts: ['per_month_paise'],
};

/** Money columns that may be empty. */
const NULLABLE_MONEY = new Set(['debts.per_month_paise']);

export interface BackupSummary {
  entries: number;
  accounts: number;
  goals: number;
  buckets: number;
  recurring: number;
  exported_at: number;
}

export function buildBackup(tables: Record<BackupTable, Row[]>, schemaVersion: number, nowMs: number): BackupFile {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, schema_version: schemaVersion, exported_at: nowMs, tables };
}

/** Parse and validate; throws a friendly message on anything unexpected. */
export function parseBackup(text: string, currentSchemaVersion: number): { backup: BackupFile; summary: BackupSummary } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Hisaab backup (it isn't valid JSON).");
  }
  const b = data as Partial<BackupFile>;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || typeof b.tables !== 'object' || b.tables == null) {
    throw new Error("This file isn't a Hisaab backup.");
  }
  if (b.format !== BACKUP_FORMAT) throw new Error('This backup was made by a different version of Hisaab.');
  if (typeof b.schema_version !== 'number' || b.schema_version > currentSchemaVersion) {
    throw new Error('This backup is from a newer version of Hisaab. Update the app first.');
  }
  for (const table of BACKUP_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[table];
    if (rows === undefined) {
      (b.tables as Record<string, unknown>)[table] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new Error(`Backup table "${table}" is damaged.`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Backup table "${table}" is damaged.`);
      for (const v of Object.values(row as object)) {
        if (v !== null && typeof v !== 'string' && typeof v !== 'number') throw new Error(`Backup table "${table}" is damaged.`);
      }
      for (const col of MONEY_COLUMNS[table] ?? []) {
        const v = (row as Row)[col];
        if (v == null && NULLABLE_MONEY.has(`${table}.${col}`)) continue;
        if (!isPaise(v)) throw new Error(`Backup has a non-integer amount in "${table}".`);
      }
    }
  }
  const tables = b.tables as Record<BackupTable, Row[]>;
  if (tables.accounts.length === 0) throw new Error('This backup has no accounts, so it looks empty.');
  const summary: BackupSummary = {
    entries: tables.transactions.filter((r) => r.type !== 'correction').length,
    accounts: tables.accounts.length,
    goals: tables.goals.filter((r) => r.status !== 'removed').length,
    buckets: tables.buckets.length,
    recurring: tables.recurring.length,
    exported_at: typeof b.exported_at === 'number' ? b.exported_at : 0,
  };
  return { backup: b as BackupFile, summary };
}

export function backupFileName(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `hisaab-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
