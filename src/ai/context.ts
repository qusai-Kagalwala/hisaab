/**
 * Context Builder — the ONLY way data reaches the AI. Each intent gets just
 * the numbers it needs, already calculated and formatted by the engine.
 * Never sent: notes, entry lists, account names, dates of single entries.
 */
import { canIAfford } from '../engine/afford';
import { monthKey, monthLabel, monthName } from '../engine/calendar';
import type { ChatContext, Intent } from '../engine/chat';
import { formatINR } from '../engine/money';
import { parseEntry } from '../engine/parser';

const fmt = (p: number) => formatINR(p, { paise: 'never' });

function topCategories(ctx: ChatContext, n: number): string[] {
  return [...ctx.month_spending.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, v]) => `${ctx.categories.find((c) => c.id === id)?.name ?? 'Other'}: ${fmt(v)}`);
}

export function buildFacts(intent: Intent, question: string, ctx: ChatContext): string {
  const { picture, safe } = ctx;
  const month = monthName(monthKey(ctx.nowMs));
  const lines: string[] = [];
  const base = () => {
    lines.push(`Safe to spend today: ${fmt(safe.per_day_paise)}`);
    lines.push(`Days left in ${month}: ${safe.days_left}`);
  };

  switch (intent) {
    case 'balance':
      lines.push(`Total money in all accounts: ${fmt(picture.total_paise)}`);
      lines.push(`Kept aside for bills this month: ${fmt(picture.reserved_paise)}`);
      if (picture.repayments_paise > 0) lines.push(`Kept aside to repay borrowed money this month: ${fmt(picture.repayments_paise)}`);
      lines.push(`Set aside in goals: ${fmt(picture.goals_paise)}`);
      if (picture.buckets.length) lines.push(`Planned in buckets (left): ${fmt(picture.in_buckets_paise)}`);
      lines.push(`Unallocated: ${fmt(picture.unallocated_paise)}`);
      base();
      break;
    case 'bucket_left': {
      const t = ` ${question.toLowerCase()} `;
      const b = picture.buckets.find((x) => t.includes(` ${x.name.toLowerCase()} `));
      if (b) {
        lines.push(`Bucket ${b.name}: planned ${fmt(b.allocated_paise)}, spent ${fmt(b.spent_paise)}, ` +
          (b.remaining_paise >= 0 ? `left ${fmt(b.remaining_paise)}` : `over by ${fmt(-b.remaining_paise)}`));
      } else {
        lines.push('That bucket was not found.');
      }
      base();
      break;
    }
    case 'spending': {
      const top = topCategories(ctx, 5);
      const total = [...ctx.month_spending.values()].reduce((a, b) => a + b, 0);
      lines.push(top.length ? `Spent so far in ${month}: ${fmt(total)}` : `Nothing logged in ${month} yet.`);
      if (top.length) lines.push(`By category: ${top.join('; ')}`);
      break;
    }
    case 'goal': {
      const active = ctx.goals.filter((g) => g.status === 'active');
      if (active.length === 0) lines.push('No goals yet.');
      for (const g of active.slice(0, 3)) {
        lines.push(
          `Goal ${g.name}: saved ${fmt(g.saved_paise)} of ${fmt(g.target_paise)}; ` +
            (g.remaining_paise === 0
              ? 'reached'
              : g.eta_month
                ? `pace ${fmt(g.pace_paise)} per month; reached by ${monthLabel(g.eta_month)} at this pace`
                : 'no saving pace yet') +
            (g.needed_per_month_paise ? `; needs ${fmt(g.needed_per_month_paise)} per month for its target date` : ''),
        );
      }
      break;
    }
    case 'afford': {
      const parsed = parseEntry(question, ctx.categories);
      if (!parsed.amount_paise) {
        lines.push('The user did not say an amount.');
        break;
      }
      const r = canIAfford({
        picture, amount_paise: parsed.amount_paise, category_id: parsed.category_id, goals: ctx.goals, nowMs: ctx.nowMs,
      });
      lines.push(`Item price: ${fmt(parsed.amount_paise)}`);
      lines.push(`Engine verdict: ${r.headline}`);
      for (const d of r.details) lines.push(d);
      break;
    }
    case 'save_tips': {
      const top = topCategories(ctx, 3);
      if (top.length) lines.push(`Biggest spending this month: ${top.join('; ')}`);
      base();
      break;
    }
    default:
      base();
  }
  return lines.join('\n');
}

/** Human-readable list for the Settings "what is sent" screen. */
export const DATA_SENT_EXPLAINER = [
  'Your question, as you typed it.',
  'Only the totals that question needs, already calculated on your phone — for example "Food: ₹4,200 this month" or "Safe to spend today: ₹640".',
  'For Ideas: the budget amount, your city and the mood you picked.',
  'For Import, only when you tap "Ask AI": just the pasted lines Hisaab could not read — nothing else.',
];

export const IMPORT_AI_MAX_LINES = 30;

/**
 * Import help: the only text sent is the lines the user pasted that the
 * offline reader couldn't understand — numbered, trimmed and capped.
 */
export function buildImportLines(lines: readonly string[]): string {
  return lines
    .slice(0, IMPORT_AI_MAX_LINES)
    .map((l, i) => `${i + 1}. ${l.replace(/\s+/g, ' ').trim().slice(0, 120)}`)
    .join('\n');
}

export const DATA_NEVER_SENT = [
  'Your list of entries, notes, account names or dates of single payments.',
  'Anything at all while AI is switched off.',
];
