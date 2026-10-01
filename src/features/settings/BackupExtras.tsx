import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Card } from '../../components/ui';
import { getSetting } from '../../db/queries';
import { checkPassword } from '../../engine/backupCrypto';
import { dayLabel } from '../../utils/dates';
import {
  backupToFolder,
  chooseBackupFolder,
  clearBackupPassword,
  forgetBackupFolder,
  readBackupKey,
  setBackupPassword,
  SETTING_AUTO_BACKUP_AT,
  SETTING_AUTO_BACKUP_ERROR,
  SETTING_BACKUP_FOLDER,
  SETTING_BACKUP_FOLDER_NAME,
} from './secureBackup';

function Head({ icon, title }: { icon: IconName; title: string }) {
  const p = usePalette();
  return (
    <View style={styles.head}>
      <Icon name={icon} size={22} color={p.accent} />
      <Text style={{ color: p.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{title}</Text>
    </View>
  );
}

/** Android's own backup to the user's Google account (no Hisaab server). */
export function GoogleBackupCard() {
  const p = usePalette();
  if (Platform.OS !== 'android') return null;
  return (
    <Card>
      <Head icon="google" title="Automatic Google backup" />
      <Text style={{ color: p.textMuted, fontSize: 13, lineHeight: 19 }}>
        Android copies Hisaab to your own Google account about once a day while the phone charges on Wi-Fi, and
        puts it back when you reinstall or set up a new phone with the same account. Your AI key is never included.
      </Text>
      <Text style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>
        Make sure it&apos;s on: phone Settings → Google → Backup → “Back up by Google One” / “Back up now”.
      </Text>
    </Card>
  );
}

/** The backup password: protects exported and weekly backup files. */
export function BackupPasswordCard({ onChange }: { onChange: (set: boolean) => void }) {
  const p = usePalette();
  const [hasKey, setHasKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void readBackupKey().then((k) => {
      setHasKey(!!k);
      onChange(!!k);
    });
  }, [onChange]);

  if (Platform.OS === 'web') return null;

  const save = async () => {
    const problem = checkPassword(pw);
    if (problem) return setMessage(problem);
    if (pw !== pw2) return setMessage('The two passwords don’t match');
    setBusy(true);
    setMessage('Setting it up… this takes a few seconds.');
    try {
      await setBackupPassword(pw);
      setHasKey(true);
      onChange(true);
      setEditing(false);
      setPw('');
      setPw2('');
      setMessage('Done. New backups are protected with this password.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await clearBackupPassword();
    setHasKey(false);
    onChange(false);
    setMessage('Password removed. New backups are not protected.');
  };

  return (
    <Card>
      <Head icon={hasKey ? 'lock-check-outline' : 'lock-open-variant-outline'} title={hasKey ? 'Backups are password-protected' : 'Protect backups with a password'} />
      <Text style={{ color: p.textMuted, fontSize: 13, lineHeight: 19 }}>
        Anyone who finds a protected backup file sees only scrambled text. You need this password to restore on a new
        phone — write it down somewhere safe. It can&apos;t be recovered.
      </Text>
      {(editing || !hasKey) && (
        <>
          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder="Backup password (6+ characters)"
            placeholderTextColor={p.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
          />
          <TextInput
            value={pw2}
            onChangeText={setPw2}
            placeholder="Type it again"
            placeholderTextColor={p.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
          />
          <Button label={hasKey ? 'Change password' : 'Set password'} icon="lock-outline" compact onPress={save} disabled={busy} />
        </>
      )}
      {hasKey && !editing && (
        <View style={styles.row}>
          <Button label="Change" variant="secondary" compact onPress={() => setEditing(true)} />
          <Button label="Remove" variant="plain" compact onPress={remove} />
        </View>
      )}
      {message && <Text style={{ color: p.text, fontSize: 13 }}>{message}</Text>}
    </Card>
  );
}

/** Weekly protected copy into a folder the user picks once. */
export function FolderBackupCard({ passwordSet }: { passwordSet: boolean }) {
  const db = useSQLiteContext();
  const p = usePalette();
  const [info, setInfo] = useState<{ folder: string | null; last: number | null; error: string | null }>({
    folder: null, last: null, error: null,
  });
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setTick((t) => t + 1);
  const { folder, last, error } = info;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getSetting(db, SETTING_BACKUP_FOLDER),
      getSetting(db, SETTING_BACKUP_FOLDER_NAME),
      getSetting(db, SETTING_AUTO_BACKUP_AT),
      getSetting(db, SETTING_AUTO_BACKUP_ERROR),
    ]).then(([uri, name, at, err]) => {
      if (alive) setInfo({ folder: uri ? name || 'Chosen folder' : null, last: at ? Number(at) : null, error: err || null });
    });
    return () => {
      alive = false;
    };
  }, [db, tick]);

  if (Platform.OS !== 'android') return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <Card>
      <Head icon="folder-sync-outline" title="Weekly backup to a folder" />
      <Text style={{ color: p.textMuted, fontSize: 13, lineHeight: 19 }}>
        Once a week, when you open Hisaab, a protected copy is saved to a folder you choose (the newest 4 are kept).
        It survives uninstalling the app. Pick a folder that a cloud app syncs, or move a copy to Drive now and then.
      </Text>
      {!passwordSet ? (
        <Text style={{ color: p.text, fontSize: 13 }}>Set a backup password above first.</Text>
      ) : folder ? (
        <>
          <Text style={{ color: p.text }}>
            Folder: <Text style={{ fontWeight: '700' }}>{folder}</Text>
            {last ? ` · last copy ${dayLabel(last)}` : ' · no copy yet'}
          </Text>
          {error && <Text style={{ color: p.text, fontSize: 13 }}>Last try didn&apos;t work: {error}</Text>}
          <View style={styles.row}>
            <Button label="Back up now" icon="content-save-outline" compact disabled={busy} onPress={() => run(() => backupToFolder(db), 'Saved a protected copy.')} />
            <Button label="Change folder" variant="secondary" compact disabled={busy} onPress={() => run(() => chooseBackupFolder(db), 'Folder changed.')} />
            <Button label="Stop" variant="plain" compact disabled={busy} onPress={() => run(() => forgetBackupFolder(db), 'Weekly backup stopped.')} />
          </View>
        </>
      ) : (
        <Button
          label="Choose folder"
          icon="folder-outline"
          compact
          disabled={busy}
          onPress={() =>
            run(async () => {
              await chooseBackupFolder(db);
              await backupToFolder(db);
            }, 'Folder chosen and first copy saved.')
          }
        />
      )}
      {message && <Text style={{ color: p.text, fontSize: 13 }}>{message}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
