import Constants from 'expo-constants';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { usePalette } from './theme';

const LINKS: { label: string; icon: IconName; url: string }[] = [
  { label: 'GitHub', icon: 'github', url: 'https://github.com/qusai-Kagalwala' },
  { label: 'LinkedIn', icon: 'linkedin', url: 'https://www.linkedin.com/in/qusai-kagalwala/' },
];

/** Who made Hisaab. Shown on the How-it-works page. */
export function MadeBy() {
  const p = usePalette();
  const version = Constants.expoConfig?.version;
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Logo size={48} />
      <Text style={[styles.made, { color: p.textMuted }]}>Designed &amp; built by</Text>
      <Text style={[styles.name, { color: p.text }]}>Qusai Kagalwala</Text>
      <Text style={[styles.company, { color: p.accent }]}>Saifee Technologies</Text>
      <View style={styles.links}>
        {LINKS.map((l) => (
          <Pressable
            key={l.label}
            onPress={() => Linking.openURL(l.url).catch(() => undefined)}
            accessibilityRole="link"
            accessibilityLabel={`${l.label} — Qusai Kagalwala`}
            style={({ pressed }) => [styles.link, { borderColor: p.border, backgroundColor: pressed ? p.surfacePressed : p.background }]}
          >
            <Icon name={l.icon} size={18} color={p.text} />
            <Text style={{ color: p.text, fontWeight: '600' }}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: p.textMuted, fontSize: 12 }}>
        Hisaab {version ? `v${version} · ` : ''}Made in India
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 18, alignItems: 'center', gap: 4, marginTop: 8 },
  made: { fontSize: 12, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  name: { fontSize: 18, fontWeight: '800' },
  company: { fontSize: 14, fontWeight: '700' },
  links: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
});
