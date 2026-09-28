import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DATA_NEVER_SENT, DATA_SENT_EXPLAINER } from '../../ai/context';
import { MIN_TAP, usePalette } from '../../components/theme';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { exportAll, importAll } from '../../db/backupQueries';
import { LATEST_SCHEMA_VERSION } from '../../db/migrations';
import { parseBackup, type BackupFile, type BackupSummary } from '../../engine/backup';
import { useAiStore, refreshModels } from '../../store/aiStore';
import { useChatStore } from '../../store/chatStore';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { dayLabel } from '../../utils/dates';
import { pickBackupText, shareBackup } from './backupFiles';

export function SettingsScreen() {
  const p = usePalette();
  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AiSection />
      <BackupSection />
      <SectionTitle>About</SectionTitle>
      <Button label="How Hisaab works" variant="secondary" compact onPress={() => router.push('/about')} />
      <Text style={{ color: p.textMuted, lineHeight: 20 }}>
        Hisaab keeps everything on this phone. No login, no server, no bank or SMS access. The app works fully with AI
        switched off.
      </Text>
    </ScrollView>
  );
}

function AiSection() {
  const db = useSQLiteContext();
  const p = usePalette();
  const ai = useAiStore();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [city, setCity] = useState(ai.city);

  const onSaveKey = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const models = await ai.saveKey(key);
      setKey('');
      setMessage(models.length ? `Key works — ${models.length} models available. Pick yours below.` : 'Key saved, but no text models were listed.');
      // Suggest a light model first and a stronger one as fallback.
      if (ai.models.length === 0 && models.length) {
        const light = models.filter((m) => /flash/i.test(m.id) && !/lite/i.test(m.id));
        const strong = models.filter((m) => /pro/i.test(m.id));
        const lite = models.filter((m) => /lite/i.test(m.id));
        const pick = [light[0], strong[0], lite[0]].filter(Boolean).map((m) => m!.id);
        await ai.setModels(db, pick.length ? pick : [models[0].id]);
        await ai.setEnabled(db, true);
      }
    } catch (e) {
      setMessage(e instanceof Error ? `That key didn't work: ${e.message}` : "That key didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    setBusy(true);
    try {
      await refreshModels();
      setMessage(null);
    } catch {
      setMessage("Couldn't reach Google. Check your internet.");
    } finally {
      setBusy(false);
    }
  };

  const toggleModel = (id: string) => {
    const next = ai.models.includes(id) ? ai.models.filter((m) => m !== id) : [...ai.models, id];
    void ai.setModels(db, next);
  };

  return (
    <>
      <SectionTitle>AI (optional)</SectionTitle>
      <Card>
        <View style={styles.between}>
          <Text style={{ color: p.text, fontWeight: '600', flex: 1 }}>Use AI</Text>
          <Switch
            value={ai.enabled}
            disabled={!ai.hasKey}
            onValueChange={(v) => void ai.setEnabled(db, v)}
            accessibilityLabel="Use AI"
          />
        </View>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          {ai.hasKey
            ? ai.enabled
              ? 'On. Ask Hisaab, Ideas and the weekly summary can use Gemini. Everything else stays offline.'
              : 'Off. Nothing is sent anywhere.'
            : 'Add your own free Gemini key to turn AI on. Without it, everything still works offline.'}
        </Text>
      </Card>

      {!ai.keyStorageOk ? (
        <Text style={{ color: p.textMuted }}>This device can&apos;t store the key securely (e.g. web), so AI is unavailable here.</Text>
      ) : ai.hasKey ? (
        <Card>
          <Text style={{ color: p.text, fontWeight: '600' }}>Gemini key saved 🔒</Text>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>Stored encrypted on this phone. Only sent to Google.</Text>
          <View style={styles.row}>
            <Button label="Check models" variant="secondary" compact onPress={onRefresh} disabled={busy} />
            <Button label="Remove key" variant="plain" compact onPress={() => void ai.removeKey(db)} />
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: p.text }}>
            Get a free key at aistudio.google.com → “Get API key” → “Create API key”, copy it and paste it here.
          </Text>
          <Text
            style={{ color: p.accent, fontSize: 13 }}
            onPress={() => router.push({ pathname: '/about', params: { section: 'ai' } })}
          >
            Step-by-step help ›
          </Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="Paste your Gemini API key"
            placeholderTextColor={p.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: p.text, borderColor: p.border }]}
          />
          <Button label={busy ? 'Checking…' : 'Check & save key'} compact onPress={onSaveKey} disabled={busy || key.trim().length < 10} />
        </Card>
      )}
      {message && <Text style={{ color: p.text }}>{message}</Text>}

      {ai.hasKey && (
        <Card>
          <Text style={{ color: p.text, fontWeight: '600' }}>Model order</Text>
          <Text style={{ color: p.textMuted, fontSize: 13 }}>
            Tap in the order to try them. If one is busy or out of free quota, the next is used.
          </Text>
          {ai.models.length > 0 && (
            <Text style={{ color: p.text }}>{ai.models.map((m, i) => `${i + 1}. ${m}`).join('\n')}</Text>
          )}
          <View style={styles.chips}>
            {(ai.available.length ? ai.available.map((m) => m.id) : ai.models).map((id) => (
              <Chip key={id} label={id} selected={ai.models.includes(id)} onPress={() => toggleModel(id)} />
            ))}
          </View>
          {ai.available.length === 0 && (
            <Text style={{ color: p.textMuted, fontSize: 13 }}>Tap “Check models” to see every model your key can use.</Text>
          )}
        </Card>
      )}

      <Card>
        <Text style={{ color: p.text, fontWeight: '600' }}>Your city (for Ideas)</Text>
        <TextInput
          value={city}
          onChangeText={setCity}
          onBlur={() => void ai.setCity(db, city)}
          placeholder="e.g. Mumbai"
          placeholderTextColor={p.textMuted}
          style={[styles.input, { color: p.text, borderColor: p.border }]}
        />
        <View style={styles.between}>
          <Text style={{ color: p.text, flex: 1 }}>Weekly 3-line summary on Home</Text>
          <Switch value={ai.weekly} onValueChange={(v) => void ai.setWeekly(db, v)} accessibilityLabel="Weekly summary" />
        </View>
      </Card>

      <Card>
        <Text style={{ color: p.text, fontWeight: '600' }}>What is sent, and to whom</Text>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>Only when AI is on, only to Google Gemini, only:</Text>
        {DATA_SENT_EXPLAINER.map((l) => (
          <Text key={l} style={{ color: p.text, fontSize: 13 }}>• {l}</Text>
        ))}
        <Text style={{ color: p.textMuted, fontSize: 13, marginTop: 4 }}>Never sent:</Text>
        {DATA_NEVER_SENT.map((l) => (
          <Text key={l} style={{ color: p.text, fontSize: 13 }}>• {l}</Text>
        ))}
        <Text style={{ color: p.textMuted, fontSize: 13, marginTop: 4 }}>
          Every amount is calculated on your phone. The AI only explains; answers with numbers it made up are thrown
          away. It never recommends stocks, funds or loans.
        </Text>
      </Card>
    </>
  );
}

function BackupSection() {
  const db = useSQLiteContext();
  const p = usePalette();
  const reloadLedger = useLedgerStore((s) => s.load);
  const reloadAi = useAiStore((s) => s.load);
  const reloadChat = useChatStore((s) => s.load);
  const showUndo = useUndoStore((s) => s.show);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reloadAll = async () => {
    await reloadLedger(db);
    await reloadAi(db);
    await reloadChat(db);
  };

  const onExport = async () => {
    try {
      const name = await shareBackup(db);
      setMessage(`Backup ready: ${name}. Keep it somewhere safe (Drive, email, WhatsApp to yourself).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  const onPick = async () => {
    setMessage(null);
    try {
      const text = await pickBackupText();
      if (text == null) return;
      setPending(parseBackup(text, LATEST_SCHEMA_VERSION));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const onRestore = async () => {
    if (!pending) return;
    // Keep a copy of what's here now, so Undo can put it back.
    const safety = await exportAll(db);
    try {
      await importAll(db, pending.backup);
    } catch {
      setMessage("That backup couldn't be restored. Nothing was changed.");
      return;
    }
    setPending(null);
    await reloadAll();
    showUndo('Backup restored', async () => {
      await importAll(db, safety);
      await reloadAll();
    });
  };

  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <Card>
        <Text style={{ color: p.textMuted, fontSize: 13 }}>
          Your data lives only on this phone. Export a backup to move to a new phone or to the installed app. (Your AI
          key is not included.)
        </Text>
        <View style={styles.row}>
          <Button label="Export backup" compact onPress={onExport} />
          <Button label="Restore from file" variant="secondary" compact onPress={onPick} />
        </View>
        {message && <Text style={{ color: p.text }}>{message}</Text>}
      </Card>
      {pending && (
        <Card>
          <Text style={{ color: p.text, fontWeight: '700' }}>Restore this backup?</Text>
          <Text style={{ color: p.textMuted }}>
            {pending.summary.entries} entries · {pending.summary.accounts} accounts · {pending.summary.goals} goals ·{' '}
            {pending.summary.recurring} bills/income
            {pending.summary.exported_at ? ` · saved ${dayLabel(pending.summary.exported_at)}` : ''}
          </Text>
          <Text style={{ color: p.text }}>It replaces what&apos;s on this phone now. You can undo for 5 seconds.</Text>
          <View style={styles.row}>
            <Button label="Replace with backup" compact onPress={onRestore} />
            <Button label="Cancel" variant="plain" compact onPress={() => setPending(null)} />
          </View>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  between: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: MIN_TAP, fontSize: 15 },
});
