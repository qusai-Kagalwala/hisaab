import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
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
import { MIN_TAP, usePalette } from '../../components/theme';
import type { ChatMessage } from '../../db/smartQueries';
import { useAiStore } from '../../store/aiStore';
import { useChatStore } from '../../store/chatStore';
import { useLedgerStore } from '../../store/ledgerStore';
import { useUndoStore } from '../../store/undoStore';

const SUGGESTIONS: { emoji: string; text: string }[] = [
  { emoji: '💰', text: 'How much do I have?' },
  { emoji: '🧾', text: 'Where did my money go?' },
  { emoji: '🛍️', text: 'Can I afford ₹2,000 shoes?' },
  { emoji: '🎯', text: 'When will I reach my goal?' },
  { emoji: '🌱', text: 'How do I save more?' },
  { emoji: '🗣️', text: 'kitna paisa bacha hai?' },
];

/** Hisaab Assistant — answers from your own numbers; AI (optional) only explains. */
export function ChatScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const messages = useChatStore((s) => s.messages);
  const load = useChatStore((s) => s.load);
  const send = useChatStore((s) => s.send);
  const clear = useChatStore((s) => s.clear);
  const thinking = useChatStore((s) => s.thinking);
  const action = useChatStore((s) => s.action);
  const dismissAction = useChatStore((s) => s.dismissAction);
  const moveMoney = useLedgerStore((s) => s.moveMoney);
  const saveAllocations = useLedgerStore((s) => s.saveAllocations);
  const showUndo = useUndoStore((s) => s.show);
  const aiOn = useAiStore((s) => s.enabled && s.hasKey && s.models.length > 0);
  const [text, setText] = useState('');
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    void load(db);
  }, [db, load]);

  const ask = async (q: string) => {
    if (!q.trim() || thinking) return;
    setText('');
    await send(db, q);
  };

  const runAction = async () => {
    if (!action) return;
    const previous = await moveMoney(db, action.from_id, action.to_id, action.amount_paise);
    dismissAction();
    showUndo(action.label.replace(/^Move/, 'Moved'), async () => {
      await saveAllocations(db, previous);
    });
  };

  const empty = messages.length === 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: p.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Ask Hisaab',
          headerRight: () =>
            !empty ? (
              <Pressable onPress={() => void clear(db)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear chat">
                <Text style={{ color: p.textMuted, fontSize: 15 }}>Clear</Text>
              </Pressable>
            ) : null,
        }}
      />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {empty ? (
          <ScrollView contentContainerStyle={styles.welcome} keyboardShouldPersistTaps="handled">
            <Text style={styles.bigEmoji}>💬</Text>
            <Text style={[styles.title, { color: p.text }]}>Ask about your money</Text>
            <Text style={[styles.lead, { color: p.textMuted }]}>
              In English or Hinglish. Every number comes from your own entries, worked out on your phone.
            </Text>
            <View style={[styles.modePill, { backgroundColor: aiOn ? p.accentSoft : p.surface, borderColor: p.border }]}>
              <Text style={{ color: aiOn ? p.accent : p.textMuted, fontSize: 13, fontWeight: '600' }}>
                {aiOn ? '✨ AI on — Gemini explains the answers' : '📴 Offline answers'}
              </Text>
            </View>
            {!aiOn && (
              <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityRole="link">
                <Text style={{ color: p.accent, fontSize: 13 }}>Want friendlier answers? Add an AI key in Settings ›</Text>
              </Pressable>
            )}
            <Text style={[styles.tryLabel, { color: p.textMuted }]}>Try asking</Text>
            <View style={styles.grid}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.text}
                  onPress={() => ask(s.text)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.suggestion,
                    { backgroundColor: pressed ? p.surfacePressed : p.surface, borderColor: p.border },
                  ]}
                >
                  <Text style={styles.suggestionEmoji}>{s.emoji}</Text>
                  <Text style={{ color: p.text, fontSize: 14, lineHeight: 19 }}>{s.text}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={list}
            style={styles.screen}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <Bubble message={item} />}
            ListFooterComponent={
              <View style={{ gap: 8 }}>
                {thinking && (
                  <View style={[styles.bubble, styles.left, { backgroundColor: p.surface, borderColor: p.border }]}>
                    <Text style={{ color: p.textMuted }}>Thinking…</Text>
                  </View>
                )}
                {action && !thinking && (
                  <View style={[styles.action, { borderColor: p.accent, backgroundColor: p.accentSoft }]}>
                    <Text style={{ color: p.text, fontSize: 14 }}>Want me to do this? Nothing changes unless you tap.</Text>
                    <Pressable onPress={runAction} accessibilityRole="button" style={[styles.actionBtn, { backgroundColor: p.accent }]}>
                      <Text style={{ color: p.accentText, fontWeight: '700', textAlign: 'center' }}>{action.label}</Text>
                    </Pressable>
                    <Pressable onPress={dismissAction} accessibilityRole="button" style={styles.actionBtn}>
                      <Text style={{ color: p.textMuted, textAlign: 'center' }}>No thanks</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            }
          />
        )}

        <View style={[styles.composer, { borderTopColor: p.border, backgroundColor: p.background }]}>
          {!empty && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.text}
                  onPress={() => ask(s.text)}
                  accessibilityRole="button"
                  style={[styles.chip, { borderColor: p.border, backgroundColor: p.surface }]}
                >
                  <Text style={{ color: p.text, fontSize: 13 }}>
                    {s.emoji} {s.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => ask(text)}
              placeholder="Ask about your money…"
              placeholderTextColor={p.textMuted}
              returnKeyType="send"
              style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
            />
            <Pressable
              onPress={() => ask(text)}
              disabled={!text.trim() || thinking}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, { backgroundColor: text.trim() ? p.accent : p.surfacePressed }]}
            >
              <Text style={{ color: text.trim() ? p.accentText : p.textMuted, fontWeight: '800', fontSize: 18 }}>↑</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const p = usePalette();
  if (message.role === 'user') {
    return (
      <View style={[styles.bubble, styles.right, { backgroundColor: p.accent }]}>
        <Text style={{ color: p.accentText, fontSize: 15, lineHeight: 21 }}>{message.content}</Text>
      </View>
    );
  }
  const [body, note] = message.content.split('\n\n(');
  return (
    <View style={[styles.bubble, styles.left, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={{ color: p.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
        {message.role === 'ai' ? '✨ HISAAB · AI' : 'HISAAB'}
      </Text>
      <Text style={{ color: p.text, fontSize: 15, lineHeight: 22 }}>{body}</Text>
      {note && <Text style={{ color: p.textMuted, fontSize: 12, marginTop: 6 }}>({note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  welcome: { padding: 20, alignItems: 'center', gap: 10 },
  bigEmoji: { fontSize: 40, marginTop: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  lead: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  modePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  tryLabel: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, width: '100%' },
  suggestion: { width: '48.5%', borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, minHeight: 84 },
  suggestionEmoji: { fontSize: 20 },
  list: { padding: 12, gap: 10 },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  right: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  left: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 },
  action: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  actionBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, minHeight: MIN_TAP, fontSize: 15 },
  send: { width: MIN_TAP, height: MIN_TAP, borderRadius: MIN_TAP / 2, alignItems: 'center', justifyContent: 'center' },
});
