/**
 * Recurring income and bills. Due items become *pending* confirmations
 * ("Expected ₹X — received?"); this module never creates transactions.
 */
import { addDays, daysInMonth, monthStartMs, shiftMonth, monthKey, startOfDayMs } from './calendar';
import { addPaise, type Paise } from './money';

export type RecurringRule = 'monthly' | 'weekly';

export interface Recurring {
  id: number;
  type: 'income' | 'expense';
  name: string;
  amount_paise: Paise;
  account_id: number;
  category_id: number | null;
  rule: RecurringRule;
  /** Monthly: day of month 1–31 (clamped to short months). Weekly: 0=Sun … 6=Sat. */
  anchor_day: number;
  /** Local-midnight ms of the next occurrence not yet turned into a pending item. */
  next_due: number;
  active: boolean;
}

export interface PendingRecurring {
  id: number;
  recurring_id: number;
  due_date: number;
  status: 'pending' | 'confirmed' | 'skipped';
  transaction_id: number | null;
}

export function validateAnchor(rule: RecurringRule, anchorDay: number): void {
  const ok = rule === 'monthly'
    ? Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31
    : Number.isInteger(anchorDay) && anchorDay >= 0 && anchorDay <= 6;
  if (!ok) throw new Error(`Invalid ${rule} day: ${anchorDay}`);
}

/** The occurrence in a given month, clamping e.g. the 31st to the 30th. */
export function monthlyOccurrence(year: number, month0: number, anchorDay: number): number {
  return new Date(year, month0, Math.min(anchorDay, daysInMonth(year, month0))).getTime();
}

/** First due date on or after today. */
export function firstDueDate(rule: RecurringRule, anchorDay: number, nowMs: number): number {
  validateAnchor(rule, anchorDay);
  const today = startOfDayMs(nowMs);
  const d = new Date(today);
  if (rule === 'weekly') {
    return addDays(today, (anchorDay - d.getDay() + 7) % 7);
  }
  const thisMonth = monthlyOccurrence(d.getFullYear(), d.getMonth(), anchorDay);
  if (thisMonth >= today) return thisMonth;
  return monthlyOccurrence(d.getFullYear(), d.getMonth() + 1, anchorDay);
}

/** The occurrence after `dueMs`. */
export function nextDueAfter(rule: RecurringRule, anchorDay: number, dueMs: number): number {
  if (rule === 'weekly') return addDays(dueMs, 7);
  const d = new Date(dueMs);
  return monthlyOccurrence(d.getFullYear(), d.getMonth() + 1, anchorDay);
}

/** Safety cap so a long-closed app never floods the user with cards. */
export const MAX_CATCH_UP = 12;

/**
 * Occurrences that are due (on or before today) and the new next_due.
 * Inactive rules produce nothing.
 */
export function collectDue(r: Recurring, nowMs: number): { dueDates: number[]; nextDue: number } {
  const dueDates: number[] = [];
  if (!r.active) return { dueDates, nextDue: r.next_due };
  const today = startOfDayMs(nowMs);
  let next = r.next_due;
  while (next <= today) {
    dueDates.push(next);
    next = nextDueAfter(r.rule, r.anchor_day, next);
  }
  return { dueDates: dueDates.slice(-MAX_CATCH_UP), nextDue: next };
}

/**
 * Money reserved for fixed bills this month: expense items still pending
 * plus expense occurrences still to come before the month ends.
 * Income is never counted before it is confirmed.
 */
export function reservedThisMonth(
  recurring: readonly Recurring[],
  pending: readonly (PendingRecurring & { amount_paise: Paise; type: 'income' | 'expense' })[],
  nowMs: number,
): Paise {
  let total: Paise = 0;
  for (const p of pending) {
    if (p.status === 'pending' && p.type === 'expense') total = addPaise(total, p.amount_paise);
  }
  const monthEnd = monthStartMs(shiftMonth(monthKey(nowMs), 1));
  for (const r of recurring) {
    if (!r.active || r.type !== 'expense') continue;
    let next = r.next_due;
    while (next < monthEnd) {
      total = addPaise(total, r.amount_paise);
      next = nextDueAfter(r.rule, r.anchor_day, next);
    }
  }
  return total;
}
