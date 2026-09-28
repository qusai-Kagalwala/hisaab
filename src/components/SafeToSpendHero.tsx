import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { explainSafeToSpend } from '../engine/buckets';
import { formatINR } from '../engine/money';
import { useLedgerStore } from '../store/ledgerStore';
import { usePalette } from './theme';
import { Card } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (p: number) => formatINR(p, { paise: 'never' });

/** The big "Safe to spend today" number, with a plain-language breakdown. */
export function SafeToSpendHero() {
  const p = usePalette();
  const picture = useLedgerStore((s) => s.picture);
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const e = explainSafeToSpend(picture, now);
  const end = new Date(now);
  end.setDate(end.getDate() + e.days_left - 1);
  const endLabel = `${end.getDate()} ${MONTHS[end.getMonth()]}`;
  const over = e.pool_paise < 0;

  return (
    <View>
      <View style={styles.hero}>
        <Text style={[styles.label, { color: p.textMuted }]}>Safe to spend today</Text>
        <Text style={[styles.amount, { color: p.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {fmt(e.per_day_paise)}
        </Text>
        <Text style={[styles.sub, { color: p.textMuted }]}>
          {over
            ? `Your plans add up to ${fmt(-e.pool_paise)} more than you have. A small rebalance fixes it.`
            : `You have ${fmt(e.pool_paise)} free until ${endLabel} (${e.days_left} ${e.days_left === 1 ? 'day' : 'days'} left, including today).`}
        </Text>
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={10} accessibilityRole="button" style={styles.toggle}>
          <Text style={{ color: p.accent, fontWeight: '600' }}>{open ? 'Hide the maths' : 'How is this worked out?'}</Text>
        </Pressable>
      </View>

      {open && (
        <Card>
          {e.steps.map((s, i) => (
            <View
              key={i}
              style={[styles.row, s.op === 'equals' && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8 }]}
            >
              <Text style={[styles.op, { color: p.textMuted }]}>{s.op === 'minus' ? '−' : s.op === 'equals' ? '=' : ''}</Text>
              <Text style={[styles.rowLabel, { color: s.op === 'equals' ? p.text : p.textMuted, fontWeight: s.op === 'equals' ? '700' : '400' }]}>
                {s.label}
              </Text>
              <Text style={[styles.rowValue, { color: p.text, fontWeight: s.op === 'equals' ? '700' : '500' }]}>{fmt(s.paise)}</Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={[styles.op, { color: p.textMuted }]}>÷</Text>
            <Text style={[styles.rowLabel, { color: p.textMuted }]}>Days left this month (today to {endLabel})</Text>
            <Text style={[styles.rowValue, { color: p.text }]}>{e.days_left}</Text>
          </View>
          <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8 }]}>
            <Text style={[styles.op, { color: p.textMuted }]}>=</Text>
            <Text style={[styles.rowLabel, { color: p.text, fontWeight: '700' }]}>Safe to spend today</Text>
            <Text style={[styles.rowValue, { color: p.text, fontWeight: '800' }]}>{fmt(e.per_day_paise)}</Text>
          </View>
          <Text style={{ color: p.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
            It&apos;s worked out fresh every day. Spend less today and tomorrow&apos;s amount goes up; spend more and it
            goes down a little. Money you&apos;ve planned for bills, goals and buckets is never counted as free.
          </Text>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  label: { fontSize: 15, fontWeight: '500' },
  amount: { fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 14, textAlign: 'center', marginTop: 4, lineHeight: 20, paddingHorizontal: 8 },
  toggle: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  op: { width: 14, fontSize: 15, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 19 },
  rowValue: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
