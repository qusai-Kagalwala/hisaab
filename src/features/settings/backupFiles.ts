/** Moving backup files in and out of the phone (share sheet / file picker). */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { exportAll } from '../../db/backupQueries';
import type { Db } from '../../db/types';
import { backupFileName } from '../../engine/backup';

/** Write a backup and open the share sheet (Drive, WhatsApp, email…). */
export async function shareBackup(db: Db): Promise<string> {
  const backup = await exportAll(db);
  const text = JSON.stringify(backup);
  const name = backupFileName(backup.exported_at);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return name;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Hisaab backup' });
  }
  return name;
}

/** Let the user pick a backup file; returns its text, or null if cancelled. */
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return new File(asset.uri).text();
}
