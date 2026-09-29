import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../components/theme';
import { UndoToast } from '../components/UndoToast';
import { migrate } from '../db/migrations';
import { DATABASE_NAME } from '../db/name';
import { useAiStore } from '../store/aiStore';
import { useLedgerStore } from '../store/ledgerStore';

// Keep the logo up until the ledger is loaded, then fade into the app.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 250 });

/**
 * If any screen crashes, show a calm message instead of a blank page.
 * Nothing is lost: every entry is already saved in the database.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const p = usePalette();
  return (
    <SafeAreaProvider>
      <View style={[styles.center, { backgroundColor: p.background, gap: 12 }]}>
        <Text style={{ color: p.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Something went wrong on this screen</Text>
        <Text style={{ color: p.textMuted, textAlign: 'center' }}>
          Your entries are safe — they were saved the moment you logged them. Tap Try again. If it keeps happening, close
          Hisaab from your recent apps and open it again.
        </Text>
        <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }} selectable>
          {error.message}
        </Text>
        <Pressable onPress={retry} accessibilityRole="button" style={[styles.retry, { backgroundColor: p.accent }]}>
          <Text style={{ color: p.accentText, fontWeight: '700' }}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaProvider>
  );
}

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
    load(db).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      SplashScreen.hideAsync().catch(() => undefined);
    });
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
          <>
            <Text style={{ color: p.text, textAlign: 'center' }}>Couldn&apos;t open your data: {error}</Text>
            <Pressable
              onPress={() => {
                setError(null);
                load(db).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
              }}
              accessibilityRole="button"
              style={[styles.retry, { backgroundColor: p.accent, marginTop: 12 }]}
            >
              <Text style={{ color: p.accentText, fontWeight: '700' }}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={p.accent} />
        )}
      </View>
    );
  }
  return <OpeningAnimation>{children}</OpeningAnimation>;
}

/** A short, calm entrance: fade in and settle up a few pixels. Skipped with Reduce motion. */
function OpeningAnimation({ children }: { children: ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) progress.setValue(1);
        else Animated.timing(progress, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    // Never leave the app invisible if the animation can't run for any reason.
    const safety = setTimeout(() => progress.setValue(1), 900);
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [progress]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function AppStack() {
  const p = usePalette();
  // Android draws its navigation (3 buttons or the gesture line) over the app's
  // bottom edge; keep every screen's content above it. Screens that handle the
  // edge themselves (tabs, chat, onboarding) opt out below.
  const insets = useSafeAreaInsets();
  const ownEdge = { contentStyle: { backgroundColor: p.background } };
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.background },
          headerTintColor: p.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: p.background, paddingBottom: insets.bottom },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Hisaab', ...ownEdge }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit', presentation: 'modal' }} />
        <Stack.Screen name="transfer" options={{ title: 'Move between accounts' }} />
        <Stack.Screen name="people/index" options={{ title: 'Borrow & lend' }} />
        <Stack.Screen name="people/new" options={{ title: 'Borrowed or lent' }} />
        <Stack.Screen name="people/[id]" options={{ title: 'Details' }} />
        <Stack.Screen name="import" options={{ title: 'Import entries' }} />
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
        <Stack.Screen name="chat" options={{ title: 'Ask Hisaab', ...ownEdge }} />
        <Stack.Screen name="ideas" options={{ title: 'Ideas' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings & backup' }} />
        <Stack.Screen name="about" options={{ title: 'How Hisaab works' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, ...ownEdge }} />
      </Stack>
      <UndoToast />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retry: { minHeight: 48, borderRadius: 14, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
});
