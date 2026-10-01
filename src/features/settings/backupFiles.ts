/** Moving backup files in and out of the phone (share sheet / file picker). */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Db } from '../../db/types';
import { backupFileName } from '../../engine/backup';
import { encryptedFileName } from '../../engine/backupCrypto';
import { backupText } from './secureBackup';

/** Write a backup (password-protected if one is set) and open the share sheet (Drive, WhatsApp, email…). */
export async function shareBackup(db: Db): Promise<string> {
  const { text, encrypted, exportedAt } = await backupText(db);
  const name = encrypted ? encryptedFileName(exportedAt) : backupFileName(exportedAt);
  const mime = encrypted ? 'application/octet-stream' : 'application/json';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
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
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: 'Save your Hisaab backup' });
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
