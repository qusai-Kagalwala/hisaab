import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { shareBackup } from '../features/settings/backupFiles';
import { useLedgerStore } from '../store/ledgerStore';
import { Icon } from './Icon';
import { usePalette } from './theme';
import { Button, Card } from './ui';

/** Calm reminder: everything is only on this phone, so keep a copy somewhere. */
export function BackupCard() {
  const db = useSQLiteContext();
  const p = usePalette();
  const backup = useLedgerStore((s) => s.backup);
  const markBackedUp = useLedgerStore((s) => s.markBackedUp);
  const snooze = useLedgerStore((s) => s.snoozeBackup);
  const [busy, setBusy] = useState(false);
  if (!backup.show) return null;

  const onBackup = async () => {
    setBusy(true);
    try {
      await shareBackup(db);
      await markBackedUp(db);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <Icon name="shield-check-outline" size={22} color={p.accent} />
        <Text style={[styles.title, { color: p.text }]}>Keep a copy of your hisaab</Text>
      </View>
      <Text style={{ color: p.textMuted }}>
        {backup.days_since == null
          ? 'Everything is saved only on this phone. A backup file in Drive, email or WhatsApp keeps it safe if the phone is lost.'
          : `Your last backup was ${backup.days_since} days ago. Save a fresh copy?`}
      </Text>
      <View style={styles.row}>
        <Button label="Back up now" icon="database-arrow-down-outline" compact disabled={busy} onPress={onBackup} />
        <Button label="Later" variant="plain" compact onPress={() => snooze(db)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
