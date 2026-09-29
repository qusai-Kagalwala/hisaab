/** Spreadsheet export: a .csv the user saves or shares (Drive, WhatsApp, email…). */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { csvFileName, transactionsCsv } from '../../engine/csv';
import { useLedgerStore } from '../../store/ledgerStore';

export async function shareCsv(nowMs = Date.now()): Promise<string> {
  const { transactions, allAccounts, categories, debts } = useLedgerStore.getState();
  const text = transactionsCsv(
    transactions, allAccounts, categories, new Map(debts.map((d) => [d.id, { person: d.person, kind: d.kind }])),
  );
  const name = csvFileName(nowMs);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
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
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Save your entries as a spreadsheet', UTI: 'public.comma-separated-values-text' });
  }
  return name;
}
