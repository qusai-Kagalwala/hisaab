/**
 * Password-protected backups and the weekly automatic copy to a folder the
 * user picks. The password itself is never stored — only the derived key, in
 * secure storage (which Android's own backup never copies).
 */
import { getRandomBytes } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { exportAll } from '../../db/backupQueries';
import { getSetting, setSetting } from '../../db/queries';
import type { Db } from '../../db/types';
import {
  autoBackupDue,
  backupsToPrune,
  encryptBackup,
  encryptedFileName,
  newBackupKey,
  parseKey,
  serializeKey,
  type BackupKey,
} from '../../engine/backupCrypto';

const KEY_NAME = 'hisaab_backup_key';
export const SETTING_BACKUP_FOLDER = 'backup_folder';
export const SETTING_BACKUP_FOLDER_NAME = 'backup_folder_name';
export const SETTING_AUTO_BACKUP_AT = 'auto_backup_at';
export const SETTING_AUTO_BACKUP_ERROR = 'auto_backup_error';

const random = (n: number) => getRandomBytes(n);

let cached: BackupKey | null | undefined;

export async function readBackupKey(): Promise<BackupKey | null> {
  if (Platform.OS === 'web') return null;
  if (cached === undefined) {
    try {
      cached = parseKey(await SecureStore.getItemAsync(KEY_NAME));
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Set (or change) the backup password. Takes a few seconds on a phone. */
export async function setBackupPassword(password: string): Promise<void> {
  const key = await newBackupKey(password, random);
  await SecureStore.setItemAsync(KEY_NAME, serializeKey(key));
  cached = key;
}

export async function clearBackupPassword(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
  cached = null;
}

/** The backup as text: protected with the password when one is set. */
export async function backupText(db: Db): Promise<{ text: string; encrypted: boolean; exportedAt: number }> {
  const backup = await exportAll(db);
  const plain = JSON.stringify(backup);
  const key = await readBackupKey();
  return key
    ? { text: encryptBackup(plain, key, random), encrypted: true, exportedAt: backup.exported_at }
    : { text: plain, encrypted: false, exportedAt: backup.exported_at };
}

/** Ask the user for a folder (phone storage, SD card, or a cloud app that offers folders). */
export async function chooseBackupFolder(db: Db): Promise<string> {
  const dir = await Directory.pickDirectoryAsync();
  await setSetting(db, SETTING_BACKUP_FOLDER, dir.uri);
  await setSetting(db, SETTING_BACKUP_FOLDER_NAME, dir.name || 'Chosen folder');
  return dir.name;
}

export async function forgetBackupFolder(db: Db): Promise<void> {
  await setSetting(db, SETTING_BACKUP_FOLDER, '');
  await setSetting(db, SETTING_BACKUP_FOLDER_NAME, '');
}

/** Write today's protected backup into the chosen folder; keep the newest 4. */
export async function backupToFolder(db: Db, nowMs = Date.now()): Promise<string> {
  const uri = await getSetting(db, SETTING_BACKUP_FOLDER);
  if (!uri) throw new Error('Choose a folder first');
  if (!(await readBackupKey())) throw new Error('Set a backup password first');
  try {
    const dir = new Directory(uri);
    const name = encryptedFileName(nowMs);
    const existing = dir.list();
    const same = existing.find((e) => e instanceof File && e.name === name) as File | undefined;
    const file = same ?? dir.createFile(name, 'application/octet-stream');
    file.write((await backupText(db)).text);
    for (const old of backupsToPrune(existing.map((e) => e.name).concat(same ? [] : [name]))) {
      const f = existing.find((e) => e.name === old);
      try {
        f?.delete();
      } catch {
        // Couldn't remove an old copy; harmless.
      }
    }
    await setSetting(db, SETTING_AUTO_BACKUP_AT, String(nowMs));
    await setSetting(db, SETTING_AUTO_BACKUP_ERROR, '');
    return name;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setSetting(db, SETTING_AUTO_BACKUP_ERROR, message);
    throw new Error(`Couldn't write to the backup folder. Choose it again. (${message})`);
  }
}

/** Once a week, when the app is opened: never blocks or bothers the user. */
export async function maybeAutoBackup(db: Db, nowMs = Date.now()): Promise<void> {
  if (Platform.OS === 'web') return;
  const [uri, last] = await Promise.all([getSetting(db, SETTING_BACKUP_FOLDER), getSetting(db, SETTING_AUTO_BACKUP_AT)]);
  if (!uri || !(await readBackupKey())) return;
  if (!autoBackupDue(last ? Number(last) : null, nowMs)) return;
  await backupToFolder(db, nowMs).catch(() => undefined);
}
