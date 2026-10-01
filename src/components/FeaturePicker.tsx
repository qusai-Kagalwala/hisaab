import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FEATURES, type Features } from '../engine/features';
import { Icon, type IconName } from './Icon';
import { MIN_TAP, usePalette } from './theme';

/** Tick the features you want; logging is always on. Nothing is deleted when unticked. */
export function FeaturePicker({ value, onChange }: { value: Features; onChange: (f: Features) => void }) {
  const p = usePalette();
  const row = (key: string, icon: IconName, title: string, description: string, on: boolean, toggle?: () => void) => (
    <Pressable
      key={key}
      onPress={toggle}
      disabled={!toggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !toggle }}
      style={({ pressed }) => [
        styles.row,
        { borderColor: on ? p.accent : p.border, backgroundColor: pressed ? p.surfacePressed : on ? p.accentSoft : p.surface },
      ]}
    >
      <Icon name={icon} size={24} color={on ? p.accent : p.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: p.textMuted, fontSize: 13, marginTop: 2 }}>{description}</Text>
      </View>
      {toggle ? (
        <Icon name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={26} color={on ? p.accent : p.textMuted} />
      ) : (
        <Text style={{ color: p.accent, fontSize: 12, fontWeight: '700' }}>Always on</Text>
      )}
    </Pressable>
  );
  return (
    <View style={styles.list}>
      {row('log', 'lightning-bolt-outline', 'Logging', 'Log a spend in 3 taps — keypad, typing or widget', true)}
      {FEATURES.map((f) =>
        row(f.id, f.icon as IconName, f.title, f.description, value[f.id], () => onChange({ ...value, [f.id]: !value[f.id] })),
      )}
      <Text style={{ color: p.textMuted, fontSize: 12, textAlign: 'center' }}>
        Change this any time in Settings → Features. Hiding a feature never deletes anything.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, minHeight: MIN_TAP + 16 },
});
