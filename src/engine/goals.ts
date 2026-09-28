/**
 * Goals: long-term targets funded by contributions (set-aside money).
 * ETA is pure math on the recent saving pace; nothing here is advice.
 */
import { monthKey, shiftMonth, type MonthKey } from './calendar';
import { addPaise, assertPaise, subtractPaise, type Paise } from './money';

export interface Goal {
  id: number;
  name: string;
  target_paise: Paise;
  target_date: number | null;
  created_at: number;
  status: 'active' | 'done' | 'removed';
}

export interface GoalContribution {
  id: number;
  goal_id: number;
  /** Positive = put aside, negative = released back. */
  amount_paise: Paise;
  created_at: number;
}

export interface GoalStatus extends Goal {
  saved_paise: Paise;
  remaining_paise: Paise;
  /** Average put aside per month over the last 90 days (rounded down). */
  pace_paise: Paise;
  /** Month the goal is reached at the current pace, or null if no pace. */
  eta_month: MonthKey | null;
  /** Needed per month to hit target_date, if there is one. */
  needed_per_month_paise: Paise | null;
}

export const PACE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function goalSaved(goalId: number, contributions: readonly GoalContribution[]): Paise {
  return addPaise(...contributions.filter((c) => c.goal_id === goalId).map((c) => c.amount_paise));
}

/**
 * Monthly pace: net contributions in the last 90 days (or since the goal
 * started, but at least 30 days) scaled to 30 days, rounded down.
 */
export function monthlyPace(goal: Goal, contributions: readonly GoalContribution[], nowMs: number): Paise {
  const since = Math.max(nowMs - PACE_WINDOW_DAYS * DAY_MS, goal.created_at);
  const windowDays = Math.max(30, Math.ceil((nowMs - since) / DAY_MS));
  const recent = addPaise(
    ...contributions.filter((c) => c.goal_id === goal.id && c.created_at >= since).map((c) => c.amount_paise),
  );
  if (recent <= 0) return 0;
  return Math.floor((recent * 30) / windowDays);
}

/** Months needed to cover `remaining` at `perMonth`, rounded up. */
export function monthsToReach(remaining: Paise, perMonth: Paise): number | null {
  assertPaise(remaining);
  assertPaise(perMonth);
  if (remaining <= 0) return 0;
  if (perMonth <= 0) return null;
  return Math.ceil(remaining / perMonth);
}

/** ETA month with an optional "what if I add ₹X more per month". */
export function goalEta(remaining: Paise, pace: Paise, nowMs: number, extraPerMonth: Paise = 0): MonthKey | null {
  const months = monthsToReach(remaining, addPaise(pace, extraPerMonth));
  if (months == null) return null;
  return shiftMonth(monthKey(nowMs), months);
}

/** Whole months left until the target date (at least 1 while it's in the future). */
export function monthsUntil(targetMs: number, nowMs: number): number {
  const a = new Date(nowMs);
  const b = new Date(targetMs);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(months, targetMs > nowMs ? 1 : 0);
}

export function goalStatus(goal: Goal, contributions: readonly GoalContribution[], nowMs: number): GoalStatus {
  const saved = goalSaved(goal.id, contributions);
  const remaining = Math.max(subtractPaise(goal.target_paise, saved), 0);
  const pace = monthlyPace(goal, contributions, nowMs);
  let needed: Paise | null = null;
  if (goal.target_date != null && remaining > 0) {
    const months = monthsUntil(goal.target_date, nowMs);
    needed = months > 0 ? Math.ceil(remaining / months) : remaining;
  }
  return {
    ...goal,
    saved_paise: saved,
    remaining_paise: remaining,
    pace_paise: pace,
    eta_month: remaining === 0 ? monthKey(nowMs) : goalEta(remaining, pace, nowMs),
    needed_per_month_paise: needed,
  };
}

/** Money set aside in active goals — part of the invariant. */
export function setAsideForGoals(goals: readonly GoalStatus[]): Paise {
  return addPaise(...goals.filter((g) => g.status === 'active').map((g) => g.saved_paise));
}

/**
 * Where a contribution comes from: the Savings bucket first, then free
 * (unallocated) money. Throws if there isn't enough.
 */
export function splitContribution(
  amount: Paise,
  savingsRemaining: Paise,
  unallocated: Paise,
): { fromSavings: Paise; fromFree: Paise } {
  assertPaise(amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  const fromSavings = Math.min(amount, Math.max(savingsRemaining, 0));
  const fromFree = amount - fromSavings;
  if (fromFree > Math.max(unallocated, 0)) {
    throw new Error('Not enough free money for that');
  }
  return { fromSavings, fromFree };
}
