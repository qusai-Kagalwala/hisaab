import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { useLedgerStore } from '../../store/ledgerStore';

// The app still opens on Add (the keypad); Android back returns there.
export const unstable_settings = { initialRouteName: 'index' };

export default function TabsLayout() {
  const p = usePalette();
  const attention = useLedgerStore((s) => s.pending.length + (s.rollover ? 1 : 0) + s.debts.filter((d) => d.due_now_paise > 0).length);
  const icon = (outline: IconName, filled: IconName) =>
    function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
      return <Icon name={focused ? filled : outline} size={24} color={String(color)} />;
    };

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        animation: 'fade',
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.textMuted,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border, height: 62, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
        headerStyle: { backgroundColor: p.background },
        headerTintColor: p.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: p.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: icon('home-variant-outline', 'home-variant'),
          tabBarBadge: attention > 0 ? attention : undefined,
          tabBarBadgeStyle: { backgroundColor: p.accent, color: p.accentText, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('history', 'history') }} />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Add',
          headerShown: false,
          tabBarAccessibilityLabel: 'Add an entry',
          tabBarButton: ({ onPress, accessibilityState }) => (
            <View style={styles.addWrap}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel="Add an entry"
                accessibilityState={accessibilityState}
                style={({ pressed }) => [
                  styles.add,
                  { backgroundColor: p.accent, borderColor: p.surface, transform: [{ scale: pressed ? 0.94 : 1 }] },
                ]}
              >
                <Icon name="plus" size={30} color={p.accentText} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('chart-box-outline', 'chart-box') }} />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: icon('dots-horizontal-circle-outline', 'dots-horizontal-circle') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center' },
  add: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -18,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(0,0,0,0.18)',
  },
});
