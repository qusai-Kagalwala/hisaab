import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { FeaturePicker } from '../../components/FeaturePicker';
import { PrivacyPromise } from '../../components/PrivacyPromise';
import { usePalette } from '../../components/theme';
import { Button } from '../../components/ui';
import { useLedgerStore } from '../../store/ledgerStore';
import { goBack } from '../../utils/nav';

/**
 * Choose which features to see. Shown once to people updating the app
 * (`?first=1`, with the privacy promise), and from Settings any time.
 */
export function FeaturesScreen() {
  const db = useSQLiteContext();
  const p = usePalette();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const current = useLedgerStore((s) => s.features);
  const hasBuckets = useLedgerStore((s) => s.picture.buckets.length > 0);
  const setFeatures = useLedgerStore((s) => s.setFeatures);
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);
  const isFirst = first === '1';

  const onSave = async () => {
    setBusy(true);
    try {
      await setFeatures(db, draft);
      if (isFirst) router.replace('/');
      else goBack('/settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
      {isFirst && (
        <>
          <PrivacyPromise compact />
          <Text style={[styles.title, { color: p.text }]}>Make Hisaab simpler</Text>
          <Text style={{ color: p.textMuted, lineHeight: 20 }}>
            Hisaab can do a lot. Keep only what you use — we ticked what you already use.
          </Text>
        </>
      )}
      <FeaturePicker value={draft} onChange={setDraft} />
      {current.buckets && !draft.buckets && hasBuckets && (
        <Text style={{ color: p.text, fontSize: 13 }}>
          Turning off Buckets clears this month&apos;s plan, so that money counts as free again. Your entries stay.
        </Text>
      )}
      <Button label={isFirst ? 'Continue' : 'Save'} onPress={onSave} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 8 },
});
