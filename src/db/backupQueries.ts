import { BACKUP_TABLES, buildBackup, type BackupFile, type BackupTable, type Row } from '../engine/backup';
import { LATEST_SCHEMA_VERSION } from './migrations';
import type { Db } from './types';

export async function exportAll(db: Db, nowMs = Date.now()): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, Row[]>;
  for (const t of BACKUP_TABLES) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t} ORDER BY rowid`);
  return buildBackup(tables, LATEST_SCHEMA_VERSION, nowMs);
}

/**
 * Replace everything with the backup, in one transaction: either all of it
 * lands or nothing changes. Only columns that exist in this version are
 * copied, so older backups get defaults for newer columns.
 */
export async function importAll(db: Db, backup: BackupFile): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of [...BACKUP_TABLES].reverse()) await db.runAsync(`DELETE FROM ${t}`);
    await db.runAsync("DELETE FROM sqlite_sequence").catch(() => undefined);
    for (const t of BACKUP_TABLES) {
      const cols = new Set(
        (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name),
      );
      for (const row of backup.tables[t]) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (keys.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((k) => row[k]),
        );
      }
    }
  });
}
