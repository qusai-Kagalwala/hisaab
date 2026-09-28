import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MIN_TAP, usePalette } from '../../components/theme';
import { useChatStore } from '../../store/chatStore';

const QUICK = ["What's left?", 'Can I afford ₹2,000 shoes?', 'Where did my money go?', 'How do I save more?', 'kitna paisa hai?'];

/** Hisaab Assistant — offline answers from your own numbers. */
export function ChatScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const messages = useChatStore((s) => s.messages);
  const load = useChatStore((s) => s.load);
  const send = useChatStore((s) => s.send);
  const clear = useChatStore((s) => s.clear);
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  useEffect(() => {
    void load(db);
  }, [db, load]);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setText('');
    await send(db, q);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Ask Hisaab',
          headerRight: () =>
            messages.length > 0 ? (
              <Pressable onPress={() => void clear(db)} hitSlop={10} accessibilityRole="button">
                <Text style={{ color: p.textMuted }}>Clear</Text>
              </Pressable>
            ) : null,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={{ color: p.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 20 }}>
              Ask about your money in English or Hinglish.{'\n'}Answers use only your own numbers, and work offline.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: p.accent }
                  : { alignSelf: 'flex-start', backgroundColor: p.surface, borderColor: p.border, borderWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text style={{ color: item.role === 'user' ? p.accentText : p.text, fontSize: 15, lineHeight: 21 }}>{item.content}</Text>
            </View>
          )}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
          {QUICK.map((q) => (
            <Pressable key={q} onPress={() => ask(q)} accessibilityRole="button" style={[styles.chip, { borderColor: p.border, backgroundColor: p.surface }]}>
              <Text style={{ color: p.text }}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => ask(text)}
            placeholder="Ask anything… (🎤 on your keyboard works too)"
            placeholderTextColor={p.textMuted}
            returnKeyType="send"
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.surface }]}
          />
          <Pressable
            onPress={() => ask(text)}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.send, { backgroundColor: text.trim() ? p.accent : p.surfacePressed }]}
          >
            <Text style={{ color: text.trim() ? p.accentText : p.textMuted, fontWeight: '800', fontSize: 18 }}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  quick: { gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, minHeight: MIN_TAP, fontSize: 15 },
  send: { width: MIN_TAP, height: MIN_TAP, borderRadius: MIN_TAP / 2, alignItems: 'center', justifyContent: 'center' },
});
