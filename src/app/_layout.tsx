import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePalette } from '../components/theme';
import { UndoToast } from '../components/UndoToast';
import { migrate } from '../db/migrations';
import { DATABASE_NAME } from '../db/name';
import { useAiStore } from '../store/aiStore';
import { useLedgerStore } from '../store/ledgerStore';


export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
        <LedgerLoader>
          <AppStack />
        </LedgerLoader>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function LedgerLoader({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const loaded = useLedgerStore((s) => s.loaded);
  const load = useLedgerStore((s) => s.load);
  const loadAi = useAiStore((s) => s.load);
  const p = usePalette();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load(db).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    loadAi(db).catch(() => undefined);
    // Coming back to the app may be a new day or month: due bills, rollover,
    // safe-to-spend all depend on the date.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(db).catch(() => undefined);
    });
    return () => sub.remove();
  }, [db, load, loadAi]);

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: p.background }]}>
        {error ? (
          <Text style={{ color: p.text, textAlign: 'center' }}>Couldn&apos;t open your data: {error}</Text>
        ) : (
          <ActivityIndicator color={p.accent} />
        )}
      </View>
    );
  }
  return <>{children}</>;
}

function AppStack() {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.background },
          headerTintColor: p.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: p.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit', presentation: 'modal' }} />
        <Stack.Screen name="home" options={{ title: 'Home' }} />
        <Stack.Screen name="buckets/index" options={{ title: 'Buckets' }} />
        <Stack.Screen name="buckets/plan" options={{ title: 'Plan your month' }} />
        <Stack.Screen name="buckets/move" options={{ title: 'Move money' }} />
        <Stack.Screen name="buckets/[id]" options={{ title: 'Bucket' }} />
        <Stack.Screen name="rollover" options={{ title: 'New month' }} />
        <Stack.Screen name="recurring/index" options={{ title: 'Bills & income' }} />
        <Stack.Screen name="recurring/edit" options={{ title: 'Add bill or income' }} />
        <Stack.Screen name="goals/index" options={{ title: 'Goals' }} />
        <Stack.Screen name="goals/[id]" options={{ title: 'Goal' }} />
        <Stack.Screen name="afford" options={{ title: 'Can I afford this?' }} />
        <Stack.Screen name="chat" options={{ title: 'Ask Hisaab' }} />
        <Stack.Screen name="insights" options={{ title: 'Insights' }} />
        <Stack.Screen name="ideas" options={{ title: 'Ideas' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings & backup' }} />
        <Stack.Screen name="about" options={{ title: 'How Hisaab works' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
      <UndoToast />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
