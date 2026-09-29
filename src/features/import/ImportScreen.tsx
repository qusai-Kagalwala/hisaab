import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { aiReadLines } from '../../ai/importAssist';
import { AccountChips } from '../../components/AccountChips';
import { CategoryIcon, Icon } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { Button, Card, SectionTitle } from '../../components/ui';
import { importTotals, parseImport, type ImportRow } from '../../engine/csv';
import { formatINR } from '../../engine/money';
import { useAiStore } from '../../store/aiStore';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { shortDate } from '../../utils/dates';

async function pickCsvText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return new File(asset.uri).text();
}

/**
 * Optional import: paste lines ("chai 20", "12/09 auto 50") or pick a CSV
 * (including the old budget.io export). Nothing is saved until the user
 * reviews the rows and taps Import. Never reads SMS or bank apps.
 */
export function ImportScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const categories = useLedgerStore((s) => s.categories);
  const memory = useLedgerStore((s) => s.merchantMemory);
  const existing = useLedgerStore((s) => s.transactions);
  const accounts = useLedgerStore((s) => s.accounts);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const importRows = useLedgerStore((s) => s.importRows);
  const undoImport = useLedgerStore((s) => s.undoImport);
  const showUndo = useUndoStore((s) => s.show);
  const aiEnabled = useAiStore((s) => s.enabled && s.hasKey && s.models.length > 0);
  const aiConfig = useAiStore((s) => s.config);

  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [accountId, setAccountId] = useState<number | null>(lastAccountId);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const chosen = useMemo(() => (rows ?? []).filter((r) => r.ok && picked.has(r.line)), [rows, picked]);
  const totals = useMemo(() => importTotals(chosen), [chosen]);
  const failed = (rows ?? []).filter((r) => !r.ok);

  const read = (source: string) => {
    const { rows: parsed } = parseImport(source, { categories, memory, existing, nowMs: Date.now() });
    setRows(parsed);
    setPicked(new Set(parsed.filter((r) => r.ok && !r.duplicate).map((r) => r.line)));
    setMessage(parsed.length === 0 ? 'Nothing to read there.' : null);
  };

  const onPick = async () => {
    try {
      const t = await pickCsvText();
      if (t != null) {
        setText('');
        read(t);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't open that file.");
    }
  };

  const onAskAi = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const fixed = await aiReadLines(failed, categories, await aiConfig());
      if (fixed.length === 0) {
        setMessage("AI couldn't read those lines either. You can add them by hand.");
      } else {
        const byLine = new Map(fixed.map((r) => [r.line, r]));
        setRows((current) => (current ?? []).map((r) => byLine.get(r.line) ?? r));
        setPicked((s) => new Set([...s, ...fixed.map((r) => r.line)]));
        setMessage(`AI read ${fixed.length} line${fixed.length === 1 ? '' : 's'} — check them before importing.`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'AI is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (busy || accountId == null || chosen.length === 0) return;
    setBusy(true);
    try {
      const ids = await importRows(db, chosen, accountId);
      showUndo(`Imported ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}`, async () => {
        await undoImport(db, ids);
      });
      router.navigate('/history');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (line: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  if (rows == null) {
    return (
      <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={{ color: p.textMuted, lineHeight: 20 }}>
          Optional: bring in entries you wrote somewhere else. Paste one per line, or pick a spreadsheet (.csv) — the
          export from the old budget.io app works too. You&apos;ll see everything before anything is saved.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={'chai 20\nauto 50 cash\n12/09 groceries 640'}
          placeholderTextColor={p.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          textAlignVertical="top"
          style={[styles.paste, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
        />
        <Button label="Read these lines" icon="content-paste" onPress={() => read(text)} disabled={!text.trim()} />
        <Button label="Pick a CSV file" icon="file-delimited-outline" variant="secondary" onPress={onPick} />
        {message && <Text style={{ color: p.text }}>{message}</Text>}
        <Text style={{ color: p.textMuted, fontSize: 12, lineHeight: 18 }}>
          Hisaab never reads your SMS or bank apps. This only reads what you paste or pick, on your phone.
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[styles.title, { color: p.text }]}>
            {chosen.length} of {rows.filter((r) => r.ok).length} ready to import
          </Text>
          <Text style={{ color: p.textMuted }}>
            {[
              totals.spent_paise > 0 ? `Spent ${formatINR(totals.spent_paise)}` : null,
              totals.in_paise > 0 ? `Money in ${formatINR(totals.in_paise)}` : null,
            ].filter(Boolean).join(' · ') || 'Tick the entries you want.'}
          </Text>
          {rows.some((r) => r.duplicate) && (
            <Text style={{ color: p.textMuted, fontSize: 13 }}>Entries that look already logged are unticked.</Text>
          )}
        </Card>

        <SectionTitle>Put them in</SectionTitle>
        <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />

        <SectionTitle>Entries</SectionTitle>
        {rows.map((r) =>
          r.ok ? (
            <Pressable
              key={r.line}
              onPress={() => toggle(r.line)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: picked.has(r.line) }}
              style={[styles.row, { backgroundColor: p.surface, borderColor: p.border }]}
            >
              <Icon name={picked.has(r.line) ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={picked.has(r.line) ? p.accent : p.textMuted} />
              <CategoryIcon icon={categoryById.get(r.category_id ?? -1)?.icon ?? 'dots-horizontal-circle'} size={20} color={p.accent} />
              <View style={styles.rowMain}>
                <Text style={{ color: p.text, fontWeight: '500' }} numberOfLines={1}>
                  {r.note || categoryById.get(r.category_id ?? -1)?.name || 'Entry'}
                </Text>
                <Text style={{ color: p.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {shortDate(r.occurred_at)} · {categoryById.get(r.category_id ?? -1)?.name ?? 'Other'}
                  {r.duplicate ? ' · looks already logged' : ''}
                </Text>
              </View>
              <Text style={[styles.amount, { color: r.type === 'income' ? p.positive : p.text }]}>
                {formatINR(r.amount_paise, { signed: r.type === 'income' })}
              </Text>
            </Pressable>
          ) : (
            <View key={r.line} style={[styles.row, { borderColor: p.border }]}>
              <Icon name="minus-circle-outline" size={22} color={p.textMuted} />
              <View style={styles.rowMain}>
                <Text style={{ color: p.textMuted }} numberOfLines={1}>{r.raw}</Text>
                <Text style={{ color: p.textMuted, fontSize: 12 }}>{r.reason}</Text>
              </View>
            </View>
          ),
        )}

        {failed.length > 0 && aiEnabled && (
          <Card>
            <Text style={{ color: p.text }}>
              {failed.length} line{failed.length === 1 ? '' : 's'} couldn&apos;t be read. Ask AI to try? Only those lines are sent.
            </Text>
            <Button label="Ask AI to read them" icon="robot-outline" variant="secondary" compact onPress={onAskAi} disabled={busy} />
          </Card>
        )}
        {message && <Text style={{ color: p.text }}>{message}</Text>}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: p.surface, borderTopColor: p.border }]}>
        <Button label="Start over" variant="plain" compact onPress={() => { setRows(null); setMessage(null); }} />
        <Button
          label={chosen.length ? `Import ${chosen.length}` : 'Import'}
          icon="tray-arrow-down"
          onPress={onImport}
          disabled={busy || chosen.length === 0 || accountId == null}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  paste: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 180, fontSize: 15 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  rowMain: { flex: 1 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
});
