import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePalette } from '../components/theme';
import { UndoToast } from '../components/UndoToast';
import { migrate } from '../db/migrations';
import { useLedgerStore } from '../store/ledgerStore';

export const DATABASE_NAME = 'hisaab.db';

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
  const p = usePalette();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load(db).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, load]);

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
      </Stack>
      <UndoToast />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
