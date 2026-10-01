import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { usePalette } from './theme';

const POINTS: [IconName, string, string][] = [
  ['cellphone-lock', 'Stored only on your phone', 'Your entries live in this phone, nowhere else.'],
  ['account-off-outline', 'No login, no account', 'No email, phone number or password needed.'],
  ['eye-off-outline', 'Not even the developer can see it', 'Hisaab has no server and no tracking.'],
  ['bank-off-outline', 'No bank or SMS access', 'You decide what goes in. Nothing is read.'],
];

/** "Your data is yours" — shown first, before anything else. */
export function PrivacyPromise({ compact }: { compact?: boolean }) {
  const p = usePalette();
  return (
    <View style={styles.wrap}>
      <View style={[styles.shield, { backgroundColor: p.accentSoft }]}>
        <Icon name="shield-lock" size={compact ? 40 : 56} color={p.accent} />
      </View>
      <Text style={[styles.title, { color: p.text, fontSize: compact ? 20 : 24 }]}>Your hisaab stays with you</Text>
      <View style={styles.points}>
        {POINTS.map(([icon, title, sub]) => (
          <View key={title} style={styles.point}>
            <Icon name={icon} size={24} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
              {!compact && <Text style={{ color: p.textMuted, fontSize: 13, marginTop: 1 }}>{sub}</Text>}
            </View>
          </View>
        ))}
      </View>
      {!compact && (
        <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
          AI help is optional and off. If you turn it on later, only the totals a question needs are sent.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  shield: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', textAlign: 'center' },
  points: { alignSelf: 'stretch', gap: 14, marginTop: 6 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
});
