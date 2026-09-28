import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountChips } from '../../components/AccountChips';
import { CategoryGrid } from '../../components/CategoryGrid';
import { Keypad } from '../../components/Keypad';
import { OverspendCard } from '../../components/OverspendCard';
import { usePalette } from '../../components/theme';
import { guessCategory } from '../../engine/categoryGuess';
import { applyKeypadKey, formatINR, formatKeypadInput, inputToPaise } from '../../engine/money';
import type { Category, CategoryKind } from '../../engine/types';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

/**
 * The app opens here. Flow: type amount → tap category → saved.
 * Account defaults to the last one used; date is now.
 */
export function CaptureScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const lastAccountId = useLedgerStore((s) => s.lastAccountId);
  const saveTransaction = useLedgerStore((s) => s.saveTransaction);
  const setLastAccount = useLedgerStore((s) => s.setLastAccount);
  const undoNew = useLedgerStore((s) => s.undoNew);
  const showUndo = useUndoStore((s) => s.show);

  const [input, setInput] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const safe = useLedgerStore((s) => s.safe);
  const attention = useLedgerStore((s) => s.pending.length + (s.rollover ? 1 : 0));
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.hidden),
    [categories, kind],
  );
  // Refreshed after each save and whenever the screen regains focus, so the
  // guess follows the time of day.
  const [guessTime, setGuessTime] = useState(() => Date.now());
  useFocusEffect(useCallback(() => setGuessTime(Date.now()), []));
  const guessedId = useMemo(
    () => guessCategory(new Date(guessTime), categories, kind),
    [guessTime, categories, kind],
  );

  const amountPaise = inputToPaise(input);

  const onCategory = async (category: Category) => {
    if (saving) return;
    if (amountPaise <= 0) {
      setHint('Type an amount first');
      return;
    }
    if (lastAccountId == null) return;
    setSaving(true);
    try {
      const id = await saveTransaction(db, {
        type: kind,
        account_id: lastAccountId,
        category_id: category.id,
        amount_paise: amountPaise,
      });
      const amountText = formatINR(amountPaise, { signed: kind === 'income' });
      showUndo(`${kind === 'income' ? 'Added' : 'Saved'} ${amountText} · ${category.name}`, async () => {
        await undoNew(db, id);
      });
      setInput('');
      setHint(null);
      setGuessTime(Date.now());
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: p.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.push('/home')}
          hitSlop={8}
          style={[styles.pill, { backgroundColor: p.accentSoft }]}
          accessibilityRole="button"
          accessibilityLabel={`Safe to spend today ${formatINR(safe.per_day_paise, { paise: 'never' })}. Open home`}
        >
          <Text style={[styles.pillLabel, { color: p.accent }]}>Today</Text>
          <Text style={[styles.pillAmount, { color: p.accent }]}>
            {formatINR(safe.per_day_paise, { paise: 'never' })}
          </Text>
          {attention > 0 && (
            <View style={[styles.badge, { backgroundColor: p.accent }]}>
              <Text style={[styles.badgeText, { color: p.accentText }]}>{attention}</Text>
            </View>
          )}
        </Pressable>
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
        <Pressable
          onPress={() => router.push('/history')}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
        >
          <Text style={[styles.navText, { color: p.textMuted }]}>History</Text>
        </Pressable>
      </View>

      <View style={styles.amountArea}>
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
      </View>

      <View style={styles.bottom}>
        <OverspendCard />
        <AccountChips
          accounts={accounts}
          selectedId={lastAccountId}
          onSelect={(id) => void setLastAccount(db, id)}
        />
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
  navButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  navText: { fontSize: 15, fontWeight: '500' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 999, paddingHorizontal: 12 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  pillAmount: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 8 },
  amountArea: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 90 },
  amount: { fontSize: 56, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 14, marginTop: 4 },
  bottom: { gap: 10, paddingBottom: 8 },
});
