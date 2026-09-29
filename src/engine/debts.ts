/**
 * Borrow & lend. Money you borrow comes into an account, money you lend
 * leaves one — neither is income or spending. Each movement is a 'transfer'
 * row linked to a debt (see TransferDirection), so the debt's numbers are
 * always derived from the ledger:
 *
 *   borrowed: principal = money in,  repaid  = money out
 *   lent:     principal = money out, got back = money in
 *
 * A borrowed debt can have a repayment plan (no interest, ever): either a
 * number of months (split evenly to the paisa) or a fixed amount per month
 * (the last instalment is what's left). What falls due this month is kept
 * aside like a bill, so safe-to-spend never counts it as free money.
 * Nothing is ever repaid automatically: the user confirms each payment.
 */
import { daysInMonth, monthKey, monthStartMs, shiftMonth, startOfDayMs } from './calendar';
import { addPaise, assertPaise, subtractPaise, type Paise } from './money';
import type { EffectiveTransaction, TransferDirection } from './types';

export type DebtKind = 'borrowed' | 'lent';

export const MAX_INSTALMENTS = 120;

export interface Debt {
  id: number;
  person: string;
  kind: DebtKind;
  /** Plan by number of months (split evenly)… */
  months: number | null;
  /** …or by a fixed amount per month. At most one of the two is set. */
  per_month_paise: Paise | null;
  /** First instalment date (local midnight, epoch ms); later ones fall on the same day of each month. */
  first_due: number | null;
  created_at: number;
}

export interface RepaymentPlan {
  months?: number | null;
  per_month_paise?: Paise | null;
}

export interface Instalment {
  /** 1-based. */
  n: number;
  due: number;
  amount_paise: Paise;
  paid_paise: Paise;
  status: 'paid' | 'part' | 'due' | 'upcoming';
}

export interface DebtStatus extends Debt {
  principal_paise: Paise;
  /** Repaid (borrowed) or got back (lent). */
  settled_paise: Paise;
  /** Still to repay / to get back. Never below 0. */
  outstanding_paise: Paise;
  schedule: Instalment[];
  /** Unpaid instalments whose date has come (borrowed only). */
  due_now_paise: Paise;
  /** Unpaid instalments due before this month ends — kept aside like a bill. */
  due_this_month_paise: Paise;
  /** The first instalment not fully paid, if any. */
  next: Instalment | null;
  settled: boolean;
  /** Ids of the debt's entries, oldest first (voided ones left out). */
  entry_ids: number[];
}

/** Money comes in when you borrow, goes out when you lend. */
export function principalDirection(kind: DebtKind): TransferDirection {
  return kind === 'borrowed' ? 'in' : 'out';
}

/** The direction of paying back (you → them) or getting back (them → you). */
export function settleDirection(kind: DebtKind): TransferDirection {
  return kind === 'borrowed' ? 'out' : 'in';
}

/** `total` in `n` parts that add up exactly; the first parts carry the odd paise. */
export function splitEvenly(total: Paise, n: number): Paise[] {
  assertPaise(total);
  if (total < 0) throw new Error('Cannot split a negative amount');
  if (!Number.isInteger(n) || n < 1) throw new Error('Pick at least one month');
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Instalment amounts for a plan, or [] when there is no plan. */
export function planAmounts(total: Paise, plan: RepaymentPlan): Paise[] {
  assertPaise(total);
  if (total <= 0) return [];
  if (plan.per_month_paise != null) {
    const per = plan.per_month_paise;
    assertPaise(per);
    if (per <= 0) throw new Error('Amount per month must be more than zero');
    const n = Math.ceil(total / per);
    if (n > MAX_INSTALMENTS) throw new Error(`That would take more than ${MAX_INSTALMENTS} months`);
    return Array.from({ length: n }, (_, i) => (i < n - 1 ? per : subtractPaise(total, per * (n - 1))));
  }
  if (plan.months != null) {
    if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > MAX_INSTALMENTS) {
      throw new Error(`Pick between 1 and ${MAX_INSTALMENTS} months`);
    }
    return splitEvenly(total, plan.months);
  }
  return [];
}

/** Throws a friendly message when a plan can't work for this amount. */
export function validatePlan(total: Paise, plan: RepaymentPlan): void {
  if (plan.months != null && plan.per_month_paise != null) throw new Error('Pick months or an amount per month, not both');
  planAmounts(total, plan);
}

/** The k-th monthly date after `firstDue` (k = 0 is firstDue), on the same day, clamped to short months. */
export function instalmentDate(firstDue: number, k: number): number {
  const d = new Date(firstDue);
  const anchor = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + k, 1);
  const day = Math.min(anchor, daysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day).getTime();
}

/**
 * When the first instalment is due. Without a day: the same date next month.
 * With a day of the month: the next such day after today.
 */
export function firstDueDate(nowMs: number, dayOfMonth?: number | null): number {
  const today = startOfDayMs(nowMs);
  if (dayOfMonth == null) return instalmentDate(today, 1);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) throw new Error('Pick a day between 1 and 31');
  const now = new Date(today);
  for (let k = 0; k < 2; k++) {
    const month = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const day = Math.min(dayOfMonth, daysInMonth(month.getFullYear(), month.getMonth()));
    const candidate = new Date(month.getFullYear(), month.getMonth(), day).getTime();
    if (candidate > today) return candidate;
  }
  return instalmentDate(today, 1);
}

/** Schedule with payments applied in order (extra payments go to the next instalments). */
export function buildSchedule(
  total: Paise,
  plan: RepaymentPlan,
  firstDue: number | null,
  settled: Paise,
  nowMs: number,
): Instalment[] {
  if (firstDue == null) return [];
  const amounts = planAmounts(total, plan);
  let left = Math.max(settled, 0);
  return amounts.map((amount, i) => {
    const paid = Math.min(left, amount);
    left -= paid;
    const due = instalmentDate(firstDue, i);
    const status: Instalment['status'] =
      paid === amount ? 'paid' : startOfDayMs(due) <= nowMs ? 'due' : paid > 0 ? 'part' : 'upcoming';
    return { n: i + 1, due, amount_paise: amount, paid_paise: paid, status };
  });
}

/** Unpaid part of the instalments dated before `untilMs`. */
function unpaidBefore(schedule: readonly Instalment[], untilMs: number): Paise {
  return addPaise(
    ...schedule.filter((s) => s.due < untilMs).map((s) => subtractPaise(s.amount_paise, s.paid_paise)),
  );
}

export function debtStatus(debt: Debt, transactions: readonly EffectiveTransaction[], nowMs: number): DebtStatus {
  const entries = transactions
    .filter((t) => t.type === 'transfer' && t.debt_id === debt.id && !t.voided)
    .sort((a, b) => a.occurred_at - b.occurred_at || a.id - b.id);
  const inDirection = principalDirection(debt.kind);
  const principal = addPaise(...entries.filter((t) => t.direction === inDirection).map((t) => t.amount_paise));
  const settled = addPaise(...entries.filter((t) => t.direction !== inDirection).map((t) => t.amount_paise));
  const outstanding = Math.max(subtractPaise(principal, settled), 0);
  const plan = { months: debt.months, per_month_paise: debt.per_month_paise };
  const schedule = debt.kind === 'borrowed' ? buildSchedule(principal, plan, debt.first_due, settled, nowMs) : [];
  const monthEnd = monthStartMs(shiftMonth(monthKey(nowMs), 1));
  const tomorrow = startOfDayMs(nowMs) + 1;
  const dueNow = Math.min(unpaidBefore(schedule, tomorrow), outstanding);
  const dueThisMonth = Math.min(unpaidBefore(schedule, monthEnd), outstanding);
  return {
    ...debt,
    principal_paise: principal,
    settled_paise: settled,
    outstanding_paise: outstanding,
    schedule,
    due_now_paise: dueNow,
    due_this_month_paise: dueThisMonth,
    next: schedule.find((s) => s.status !== 'paid') ?? null,
    settled: principal > 0 && outstanding === 0,
    entry_ids: entries.map((t) => t.id),
  };
}

/** Debts that still matter: something recorded, and not all of it deleted. */
export function visibleDebts(statuses: readonly DebtStatus[]): DebtStatus[] {
  return statuses.filter((d) => d.entry_ids.length > 0);
}

/** Kept aside this month for repayments (borrowed debts with a plan). */
export function repaymentsThisMonth(statuses: readonly DebtStatus[]): Paise {
  return addPaise(...statuses.filter((d) => d.kind === 'borrowed').map((d) => d.due_this_month_paise));
}

export interface DebtTotals {
  you_owe_paise: Paise;
  owed_to_you_paise: Paise;
}

export function debtTotals(statuses: readonly DebtStatus[]): DebtTotals {
  return {
    you_owe_paise: addPaise(...statuses.filter((d) => d.kind === 'borrowed').map((d) => d.outstanding_paise)),
    owed_to_you_paise: addPaise(...statuses.filter((d) => d.kind === 'lent').map((d) => d.outstanding_paise)),
  };
}

/** Distinct names already used, most recent first (for quick picking). */
export function knownPeople(debts: readonly Debt[]): string[] {
  const seen = new Map<string, string>();
  for (const d of [...debts].sort((a, b) => b.created_at - a.created_at)) {
    const key = d.person.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, d.person.trim());
  }
  return [...seen.values()];
}
