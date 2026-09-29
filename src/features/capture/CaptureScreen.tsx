import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountChips } from '../../components/AccountChips';
import { CategoryGrid } from '../../components/CategoryGrid';
import { CategoryIcon, Icon } from '../../components/Icon';
import { Keypad } from '../../components/Keypad';
import { OverspendCard } from '../../components/OverspendCard';
import { MIN_TAP, usePalette } from '../../components/theme';
import { guessCategory } from '../../engine/categoryGuess';
import { applyKeypadKey, formatINR, formatKeypadInput, inputToPaise, type Paise } from '../../engine/money';
import { parseEntry } from '../../engine/parser';
import { startListening, voiceAvailable, type Listening } from './voice';
import type { Category, CategoryKind } from '../../engine/types';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';
import { savedTap } from '../../utils/haptics';

/** Outside the component so the React compiler doesn't treat it as render-time work. */
const currentTime = () => Date.now();

interface SaveInput {
  type: CategoryKind;
  category: Category;
  amount: Paise;
  accountId: number;
  note?: string | null;
  learn?: boolean;
  verb?: string;
}

/**
 * The app opens here. Two ways to log, both ≤3 taps:
 *  - keypad: type amount → tap category → saved
 *  - text: type "chai 20" with the phone's own keyboard (or its mic) → Enter
 * Quick chips save in one tap; long-press the amount to repeat the last entry.
 */
export function CaptureScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const memory = useLedgerStore((s) => s.merchantMemory);
  const picks = useLedgerStore((s) => s.quickPicks);
  const last = useLedgerStore((s) => s.lastEntry);
  const mode = useLedgerStore((s) => s.captureMode);
  const setMode = useLedgerStore((s) => s.setCaptureMode);
  const saveTransaction = useLedgerStore((s) => s.saveTransaction);
  const setLastAccount = useLedgerStore((s) => s.setLastAccount);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const safe = useLedgerStore((s) => s.safe);
  const attention = useLedgerStore((s) => s.pending.length + (s.rollover ? 1 : 0));
  const showUndo = useUndoStore((s) => s.show);

  const [input, setInput] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moreWays, setMoreWays] = useState(false);
  // In-app mic (APK only); the keyboard's own mic works everywhere.
  const [canListen] = useState(voiceAvailable);
  const [listening, setListening] = useState<Listening | null>(null);

  const toggleMic = async () => {
    if (listening) {
      listening.stop();
      return;
    }
    setHint('Listening… say it like “chai bees” or “auto fifty cash”');
    try {
      const l = await startListening({
        onText: (t) => setText(t),
        onEnd: () => {
          setListening(null);
          setHint(null);
        },
        onError: (m) => {
          setListening(null);
          setHint(m);
        },
      });
      setListening(l);
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Voice is not available.');
    }
  };

  // Refreshed after each save and on focus, so the guess follows the time of day.
  const [guessTime, setGuessTime] = useState(() => Date.now());
  useFocusEffect(useCallback(() => setGuessTime(Date.now()), []));

  const parsed = useMemo(() => parseEntry(text, categories, memory), [text, categories, memory]);
  const parsedCategory = categories.find((c) => c.id === parsed.category_id) ?? null;
  // In text mode a recognised income category ("salary 30000") switches to Money in.
  const effectiveKind: CategoryKind = mode === 'text' && parsedCategory ? parsedCategory.kind : kind;
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === effectiveKind && !c.hidden),
    [categories, effectiveKind],
  );
  const guessedId = useMemo(
    () => guessCategory(new Date(guessTime), categories, effectiveKind),
    [guessTime, categories, effectiveKind],
  );
  const textAccountId =
    (parsed.account_type && accounts.find((a) => a.type === parsed.account_type)?.id) || lastAccountId;

  const amountPaise = mode === 'keypad' ? inputToPaise(input) : parsed.amount_paise ?? 0;
  const highlightedId = mode === 'text' ? parsed.category_id ?? guessedId : guessedId;
  const highlighted = categories.find((c) => c.id === highlightedId) ?? null;

  const save = async ({ type, category, amount, accountId, note, learn, verb }: SaveInput) => {
    if (saving) return;
    setSaving(true);
    try {
      const id = await saveTransaction(
        db,
        { type, account_id: accountId, category_id: category.id, amount_paise: amount, note: note || null },
        { learn },
      );
      savedTap();
      const amountText = formatINR(amount, { signed: type === 'income' });
      showUndo(`${verb ?? (type === 'income' ? 'Added' : 'Saved')} ${amountText} · ${category.name}`, async () => {
        await undoNew(db, id);
      });
      setInput('');
      setText('');
      setHint(null);
      setGuessTime(currentTime());
    } catch {
      setHint("Couldn't save that — please try again");
    } finally {
      setSaving(false);
    }
  };

  const onCategory = (category: Category) => {
    if (amountPaise <= 0) {
      setHint(mode === 'text' ? 'Add an amount, like "chai 20"' : 'Type an amount first');
      return;
    }
    if (mode === 'text') {
      if (textAccountId == null) return;
      // Tapping a category for a noted entry teaches Hisaab for next time.
      void save({
        type: category.kind, category, amount: amountPaise, accountId: textAccountId,
        note: parsed.note, learn: !!parsed.note && category.id !== parsed.category_id,
      });
    } else if (lastAccountId != null) {
      void save({ type: kind, category, amount: amountPaise, accountId: lastAccountId });
    }
  };

  const onSubmitText = () => {
    if (amountPaise <= 0) return setHint('Add an amount, like "chai 20"');
    if (!highlighted) return setHint('Tap a category below');
    onCategory(highlighted);
  };

  const onRepeat = () => {
    if (!last || last.category_id == null) return setHint('Nothing to repeat yet');
    const category = categories.find((c) => c.id === last.category_id);
    if (!category) return;
    void save({
      type: last.type === 'income' ? 'income' : 'expense', category, amount: last.amount_paise,
      accountId: last.account_id, note: last.note, verb: 'Repeated',
    });
  };

  const chips = picks.length > 0 && (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      {picks.map((pick) => {
        const category = categories.find((c) => c.id === pick.category_id);
        if (!category || lastAccountId == null) return null;
        const label = formatINR(pick.amount_paise, { paise: 'auto' });
        return (
          <Pressable
            key={`${pick.category_id}:${pick.amount_paise}`}
            onPress={() => save({ type: 'expense', category, amount: pick.amount_paise, accountId: lastAccountId, note: pick.note })}
            accessibilityRole="button"
            accessibilityLabel={`Quick add ${formatINR(pick.amount_paise)} ${category.name}`}
            style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border }]}
          >
            <View style={styles.chipInner}>
              <CategoryIcon icon={category.icon} size={18} color={p.accent} />
              <Text style={[styles.chipText, { color: p.text }]}>{label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        onPress={() => router.navigate('/home')}
        hitSlop={8}
        style={[styles.pill, { backgroundColor: p.accentSoft }]}
        accessibilityRole="button"
        accessibilityLabel={`Safe to spend today ${formatINR(safe.per_day_paise, { paise: 'never' })}. Open home`}
      >
        <Text style={[styles.pillLabel, { color: p.accent }]}>Today</Text>
        <Text style={[styles.pillAmount, { color: p.accent }]}>{formatINR(safe.per_day_paise, { paise: 'never' })}</Text>
        {attention > 0 && (
          <View style={[styles.badge, { backgroundColor: p.accent }]}>
            <Text style={[styles.badgeText, { color: p.accentText }]}>{attention}</Text>
          </View>
        )}
      </Pressable>
      {mode === 'keypad' ? (
        <View style={[styles.segment, { borderColor: p.border }]}>
          {(['expense', 'income'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k }}
              style={[styles.segmentItem, kind === k && { backgroundColor: p.accentSoft }]}
            >
              <Text style={{ color: kind === k ? p.accent : p.textMuted, fontWeight: '600' }}>
                {k === 'expense' ? 'Spent' : 'Money in'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View />
      )}
      <Pressable
        onPress={() => setMoreWays((v) => !v)}
        hitSlop={8}
        style={[styles.navButton, moreWays && { backgroundColor: p.accentSoft }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreWays }}
        accessibilityLabel="Move money, borrowed or lent"
      >
        <Icon name="swap-horizontal" size={24} color={moreWays ? p.accent : p.textMuted} />
      </Pressable>
    </View>
  );

  // Less frequent entries, one tap away: they are not spending or income.
  const moreRow = moreWays && (
    <View style={styles.moreRow}>
      {([
        { label: 'Move money', icon: 'swap-horizontal', go: () => router.push('/transfer') },
        { label: 'I borrowed', icon: 'hand-coin-outline', go: () => router.push({ pathname: '/people/new', params: { kind: 'borrowed' } }) },
        { label: 'I lent', icon: 'hand-coin-outline', go: () => router.push({ pathname: '/people/new', params: { kind: 'lent' } }) },
      ] as const).map((w) => (
        <Pressable
          key={w.label}
          onPress={() => {
            setMoreWays(false);
            w.go();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.moreChip, { borderColor: p.border, backgroundColor: pressed ? p.surfacePressed : p.surface }]}
        >
          <Icon name={w.icon} size={18} color={p.accent} />
          <Text style={{ color: p.text, fontWeight: '600', fontSize: 13 }}>{w.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const modeToggle = (
    <Pressable
      onPress={() => {
        setHint(null);
        void setMode(db, mode === 'keypad' ? 'text' : 'keypad');
      }}
      accessibilityRole="button"
      accessibilityLabel={mode === 'keypad' ? 'Type with keyboard instead' : 'Use number keypad instead'}
      hitSlop={8}
      style={[styles.toggle, { borderColor: p.border }]}
    >
      <View style={styles.chipInner}>
        <Icon name={mode === 'keypad' ? 'keyboard-outline' : 'dialpad'} size={18} color={p.textMuted} />
        <Text style={{ color: p.textMuted, fontWeight: '600' }}>{mode === 'keypad' ? 'Type' : 'Keypad'}</Text>
      </View>
    </Pressable>
  );

  if (mode === 'text') {
    const preview = [
      parsed.amount_paise ? formatINR(parsed.amount_paise, { signed: effectiveKind === 'income' }) : null,
      highlighted ? highlighted.name : null,
      accounts.find((a) => a.id === textAccountId)?.name,
    ].filter(Boolean).join(' · ');
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: p.background }]} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {topBar}
          {moreRow}
          <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setHint(null);
            }}
            onSubmitEditing={onSubmitText}
            placeholder="chai 20 · auto 50 cash · 2k rent"
            placeholderTextColor={p.textMuted}
            autoFocus
            returnKeyType="done"
            submitBehavior="submit"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Type an entry"
            style={[styles.textInput, { color: p.text, borderColor: p.accent, backgroundColor: p.surface }]}
          />
          {canListen && (
            <Pressable
              onPress={toggleMic}
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Stop listening' : 'Speak an entry'}
              style={[styles.mic, { backgroundColor: listening ? p.accent : p.accentSoft }]}
            >
              <Icon name={listening ? 'stop' : 'microphone-outline'} size={24} color={listening ? p.accentText : p.accent} />
            </Pressable>
          )}
          </View>
          <View style={styles.previewRow}>
            <Text style={[styles.preview, { color: text ? p.text : p.textMuted }]} numberOfLines={2}>
              {hint ?? (text ? preview || 'Add an amount…' : canListen ? 'Tip: tap the mic to speak it' : 'Tip: tap the mic on your keyboard to speak it')}
            </Text>
            {modeToggle}
          </View>
          <ScrollView contentContainerStyle={styles.textBottom} keyboardShouldPersistTaps="handled">
            <OverspendCard />
            {chips}
            <AccountChips accounts={accounts} selectedId={textAccountId} onSelect={(id) => void setLastAccount(db, id)} />
            <CategoryGrid categories={visibleCategories} highlightedId={highlightedId} onPress={onCategory} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: p.background }]} edges={['top']}>
      {topBar}
      {moreRow}
      <Pressable
        style={styles.amountArea}
        onLongPress={onRepeat}
        delayLongPress={450}
        accessibilityHint="Long press to repeat your last entry"
      >
        <Text
          style={[styles.amount, { color: input ? p.text : p.textMuted }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`Amount ${formatINR(amountPaise)}`}
        >
          {formatKeypadInput(input)}
        </Text>
        <Text style={[styles.hint, { color: p.textMuted }]}>
          {hint ?? (kind === 'expense' ? 'Type amount, then tap a category' : 'Type amount, then tap where it came from')}
        </Text>
        <View style={styles.toggleRow}>{modeToggle}</View>
      </Pressable>

      <View style={styles.bottom}>
        <OverspendCard />
        {chips}
        <AccountChips accounts={accounts} selectedId={lastAccountId} onSelect={(id) => void setLastAccount(db, id)} />
        <CategoryGrid categories={visibleCategories} highlightedId={guessedId} onPress={onCategory} />
        <Keypad
          onKey={(key) => {
            setHint(null);
            setInput((prev) => applyKeypadKey(prev, key));
          }}
          onClear={() => setInput('')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  navButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  moreRow: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  moreChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, minHeight: 44 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 999, paddingHorizontal: 12 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  pillAmount: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 8 },
  amountArea: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 110 },
  amount: { fontSize: 56, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 14, marginTop: 4 },
  toggleRow: { marginTop: 8 },
  toggle: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bottom: { gap: 10, paddingBottom: 8 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textInput: { flex: 1, borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, minHeight: MIN_TAP + 12, fontSize: 22, marginTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  mic: { width: MIN_TAP + 8, height: MIN_TAP + 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  preview: { flex: 1, fontSize: 16, fontWeight: '600' },
  textBottom: { gap: 10, paddingBottom: 16 },
});
