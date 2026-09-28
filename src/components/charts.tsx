/**
 * Small, dependency-light charts (react-native-svg). Thin marks with
 * rounded data-ends on the baseline, recessive grid, one axis, text in text
 * colours (never series colours), tap a mark to read its value.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import type { CategorySlice, MonthFlow } from '../engine/charts';
import { monthName } from '../engine/calendar';
import { formatINR, type Paise } from '../engine/money';
import { usePalette } from './theme';

const fmt = (p: Paise) => formatINR(p, { paise: 'never' });

/** Bar with a 4px rounded top, anchored flat on the baseline. */
function barPath(x: number, w: number, baseline: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  const top = baseline - h;
  return `M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`;
}

/** Ranked horizontal bars: magnitude by category. */
export function CategoryBars({
  slices,
  onPress,
}: {
  slices: CategorySlice[];
  onPress?: (slice: CategorySlice) => void;
}) {
  const p = usePalette();
  const max = Math.max(1, ...slices.map((s) => s.paise));
  return (
    <View style={styles.list}>
      {slices.map((s) => (
        <Pressable
          key={`${s.category_id}`}
          onPress={() => onPress?.(s)}
          disabled={!onPress || s.category_id === -1}
          accessibilityRole="button"
          accessibilityLabel={`${s.name} ${fmt(s.paise)}, ${s.percent} percent`}
          style={({ pressed }) => [styles.hRow, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.hHead}>
            <Text style={{ color: p.text, fontSize: 14 }} numberOfLines={1}>
              {s.icon} {s.name}
            </Text>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {fmt(s.paise)} <Text style={{ color: p.textMuted, fontWeight: '400' }}>{s.percent}%</Text>
            </Text>
          </View>
          <View style={[styles.hTrack, { backgroundColor: p.grid }]}>
            <View style={[styles.hFill, { width: `${Math.max(2, Math.round((s.paise * 100) / max))}%`, backgroundColor: p.series1 }]} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Money in vs out per month (two series, one axis). */
export function FlowBars({ flows }: { flows: MonthFlow[] }) {
  const p = usePalette();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen - 64, 560);
  const height = 150;
  const base = height - 4;
  const [sel, setSel] = useState<number>(flows.length - 1);
  const max = Math.max(1, ...flows.flatMap((f) => [f.in_paise, f.out_paise]));
  const group = width / flows.length;
  const bw = Math.min(16, (group - 14) / 2);
  const selected = flows[sel];

  return (
    <View>
      <View style={styles.legend}>
        <Swatch color={p.series1} label="Money in" />
        <Swatch color={p.series2} label="Money out" />
      </View>
      <Text style={[styles.readout, { color: p.text }]}>
        {monthName(selected.month)}: in {fmt(selected.in_paise)} · out {fmt(selected.out_paise)}
      </Text>
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={base} y2={base} stroke={p.grid} strokeWidth={1} />
          {flows.map((f, i) => {
            const cx = group * i + group / 2;
            const hIn = Math.round(((base - 8) * f.in_paise) / max);
            return (
              <Path key={`in-${f.month}`} d={barPath(cx - bw - 1, bw, base, hIn)} fill={p.series1} opacity={i === sel ? 1 : 0.55} />
            );
          })}
          {flows.map((f, i) => {
            const cx = group * i + group / 2;
            const hOut = Math.round(((base - 8) * f.out_paise) / max);
            return (
              <Path key={`out-${f.month}`} d={barPath(cx + 1, bw, base, hOut)} fill={p.series2} opacity={i === sel ? 1 : 0.55} />
            );
          })}
        </Svg>
        <HitAreas count={flows.length} width={width} height={height} onPress={setSel} label={(i) => monthName(flows[i].month)} />
      </View>
      <View style={[styles.axis, { width }]}>
        {flows.map((f, i) => (
          <Pressable key={f.month} onPress={() => setSel(i)} style={{ width: group, alignItems: 'center' }} hitSlop={6}>
            <Text style={{ color: i === sel ? p.text : p.textMuted, fontSize: 12, fontWeight: i === sel ? '700' : '400' }}>
              {monthName(f.month).slice(0, 3)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Daily spending this month, with the current safe-to-spend per day as a reference line. */
export function DailyBars({ days, safePerDay }: { days: { day: number; paise: Paise }[]; safePerDay: Paise }) {
  const p = usePalette();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen - 64, 560);
  const height = 140;
  const base = height - 4;
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, safePerDay, ...days.map((d) => d.paise));
  const step = width / Math.max(days.length, 1);
  const bw = Math.max(3, Math.min(12, step - 2));
  const refY = base - Math.round(((base - 8) * safePerDay) / max);
  const chosen = sel != null ? days[sel] : null;

  return (
    <View>
      <Text style={[styles.readout, { color: p.text }]}>
        {chosen ? `Day ${chosen.day}: ${fmt(chosen.paise)}` : 'Tap a day to see what you spent'}
      </Text>
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={base} y2={base} stroke={p.grid} strokeWidth={1} />
          {days.map((d, i) => (
            <Path
              key={d.day}
              d={barPath(step * i + (step - bw) / 2, bw, base, Math.round(((base - 8) * d.paise) / max))}
              fill={p.series1}
              opacity={sel == null || sel === i ? 1 : 0.45}
            />
          ))}
          {safePerDay > 0 && (
            <Line x1={0} x2={width} y1={refY} y2={refY} stroke={p.textMuted} strokeWidth={1.5} strokeDasharray="4 4" />
          )}
        </Svg>
        <HitAreas count={days.length} width={width} height={height} onPress={setSel} label={(i) => `Day ${days[i].day}`} />
      </View>
      <View style={[styles.legend, { marginTop: 6 }]}>
        <Swatch color={p.series1} label="Spent that day" />
        {safePerDay > 0 && <Text style={{ color: p.textMuted, fontSize: 12 }}>- - Safe to spend today: {fmt(safePerDay)}</Text>}
      </View>
    </View>
  );
}

/** Invisible tap columns laid over a chart (bigger than the marks themselves). */
function HitAreas({
  count, width, height, onPress, label,
}: { count: number; width: number; height: number; onPress: (i: number) => void; label: (i: number) => string }) {
  const step = width / Math.max(count, 1);
  return (
    <View style={[StyleSheet.absoluteFill, styles.hitRow]}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable key={i} onPress={() => onPress(i)} accessibilityRole="button" accessibilityLabel={label(i)} style={{ width: step, height }} />
      ))}
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  const p = usePalette();
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={{ color: p.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  hRow: { gap: 4 },
  hHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  hFill: { height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', alignItems: 'center' },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  readout: { fontSize: 14, fontWeight: '600', marginVertical: 6, fontVariant: ['tabular-nums'] },
  axis: { flexDirection: 'row', marginTop: 4 },
  hitRow: { flexDirection: 'row' },
});
