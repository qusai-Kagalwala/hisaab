import { StyleSheet, Text, View } from 'react-native';
import type { Insight } from '../engine/insights';
import { Icon, type IconName } from './Icon';
import { usePalette } from './theme';
import { Card } from './ui';

const ICON: Record<Insight['kind'], IconName> = {
  pace: 'speedometer',
  bucket: 'gauge',
  trend_up: 'trending-up',
  trend_down: 'trending-down',
};

export function InsightCard({ insight }: { insight: Insight }) {
  const p = usePalette();
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: p.accentSoft }]}>
          <Icon name={ICON[insight.kind]} size={18} color={p.accent} />
        </View>
        <Text style={{ color: p.text, lineHeight: 20, flex: 1 }}>{insight.text}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
