import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../components/theme';
import { Chip, MoneyField } from '../../components/ui';
import { buildSchedule, firstDueDate, MAX_INSTALMENTS, type RepaymentPlan } from '../../engine/debts';
import { formatINR, inputToPaise, type Paise } from '../../engine/money';
import { shortDate } from '../../utils/dates';

export interface PlanDraft {
  mode: 'months' | 'amount' | 'none';
  months: number;
  perMonth: string;
  /** Day of the month for payments; null = keep `baseFirstDue`. */
  day: number | null;
}

export function draftPlan(d: PlanDraft): RepaymentPlan {
  if (d.mode === 'months') return { months: d.months };
  if (d.mode === 'amount') return { per_month_paise: inputToPaise(d.perMonth) };
  return {};
}

export function draftFirstDue(d: PlanDraft, baseFirstDue: number, nowMs: number): number | null {
  if (d.mode === 'none') return null;
  return d.day == null ? baseFirstDue : firstDueDate(nowMs, d.day);
}

const MONTH_CHOICES = [1, 2, 3, 4, 6, 12];
const DAY_CHOICES = [1, 5, 10, 15, 20, 25];

/**
 * "How will you pay it back?" — months or an amount per month, no interest.
 * Shows the full breakdown as the user chooses. All numbers come from the engine.
 */
export function PlanEditor({
  total,
  draft,
  onChange,
  baseFirstDue,
  nowMs,
  person,
}: {
  total: Paise;
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  baseFirstDue: number;
  nowMs: number;
  person: string;
}) {
  const p = usePalette();
  const [customMonths, setCustomMonths] = useState(MONTH_CHOICES.includes(draft.months) ? '' : String(draft.months));
  const set = (patch: Partial<PlanDraft>) => onChange({ ...draft, ...patch });

  const preview = useMemo(() => {
    if (draft.mode === 'none' || total <= 0) return { rows: [], error: null as string | null };
    if (draft.mode === 'amount' && inputToPaise(draft.perMonth) <= 0) return { rows: [], error: 'Enter how much you can pay each month' };
    try {
      const first = draftFirstDue(draft, baseFirstDue, nowMs)!;
      return { rows: buildSchedule(total, draftPlan(draft), first, 0, nowMs), error: null };
    } catch (e) {
      return { rows: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft, total, baseFirstDue, nowMs]);

  const rows = preview.rows;
  const shown = rows.length > 6 ? [...rows.slice(0, 3), null, ...rows.slice(-2)] : rows;
  const equal = rows.length > 0 && rows.every((r) => r.amount_paise === rows[0].amount_paise);

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        <Chip label="In months" selected={draft.mode === 'months'} onPress={() => set({ mode: 'months' })} />
        <Chip label="Amount per month" selected={draft.mode === 'amount'} onPress={() => set({ mode: 'amount' })} />
        <Chip label="No fixed plan" selected={draft.mode === 'none'} onPress={() => set({ mode: 'none' })} />
      </View>

      {draft.mode === 'months' && (
        <>
          <Text style={{ color: p.textMuted }}>How many months?</Text>
          <View style={styles.chips}>
            {MONTH_CHOICES.map((m) => (
              <Chip
                key={m}
                label={String(m)}
                selected={draft.months === m && customMonths === ''}
                onPress={() => {
                  setCustomMonths('');
                  set({ months: m });
                }}
              />
            ))}
            <TextInput
              value={customMonths}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '').slice(0, 3);
                setCustomMonths(digits);
                const n = Number(digits);
                if (n >= 1 && n <= MAX_INSTALMENTS) set({ months: n });
              }}
              placeholder="Other"
              placeholderTextColor={p.textMuted}
              keyboardType="number-pad"
              accessibilityLabel="Number of months"
              style={[styles.custom, { color: p.text, borderColor: customMonths ? p.accent : p.border, backgroundColor: p.surface }]}
            />
          </View>
        </>
      )}

      {draft.mode === 'amount' && (
        <>
          <Text style={{ color: p.textMuted }}>How much can you pay each month?</Text>
          <MoneyField value={draft.perMonth} onChange={(v) => set({ perMonth: v })} />
        </>
      )}

      {draft.mode !== 'none' && (
        <>
          <Text style={{ color: p.textMuted }}>Pay on</Text>
          <View style={styles.chips}>
            <Chip label={shortDate(baseFirstDue).slice(0, -5)} selected={draft.day == null} onPress={() => set({ day: null })} />
            {DAY_CHOICES.map((d) => (
              <Chip key={d} label={`${d}${d === 1 ? 'st' : 'th'}`} selected={draft.day === d} onPress={() => set({ day: d })} />
            ))}
          </View>
        </>
      )}

      {draft.mode === 'none' ? (
        <Text style={{ color: p.textMuted }}>
          Fine too. Hisaab will just remember that you owe {person || 'them'} — nothing is kept aside each month.
        </Text>
      ) : preview.error ? (
        <Text style={{ color: p.text }}>{preview.error}</Text>
      ) : rows.length > 0 ? (
        <View style={[styles.preview, { backgroundColor: p.accentSoft }]}>
          <View style={styles.row}>
            <Icon name="calendar-month-outline" size={18} color={p.accent} />
            <Text style={[styles.summary, { color: p.accent }]}>
              {rows.length === 1
                ? `One payment of ${formatINR(rows[0].amount_paise)}`
                : equal
                  ? `${rows.length} payments of ${formatINR(rows[0].amount_paise)}`
                  : `${rows.length} payments`}
              {' · no interest'}
            </Text>
          </View>
          {shown.map((r, i) =>
            r == null ? (
              <Text key={`gap${i}`} style={{ color: p.textMuted, paddingLeft: 26 }}>…</Text>
            ) : (
              <View key={r.n} style={styles.line}>
                <Text style={{ color: p.textMuted, width: 26 }}>{r.n}.</Text>
                <Text style={{ color: p.text, flex: 1 }}>{shortDate(r.due)}</Text>
                <Text style={[styles.amount, { color: p.text }]}>{formatINR(r.amount_paise)}</Text>
              </View>
            ),
          )}
          <Text style={{ color: p.textMuted, fontSize: 12 }}>
            Each month&apos;s payment is kept aside, so safe to spend never counts it. You confirm every payment yourself.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  custom: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 42, minWidth: 76, fontSize: 15 },
  preview: { borderRadius: 14, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { fontWeight: '700', flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center' },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
