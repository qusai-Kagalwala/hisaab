/**
 * Pre-select a likely category on the capture screen from the time of day.
 * Phase 3 layers merchant_memory on top of this; this rule is the fallback.
 */
import { CATEGORY_ID } from './defaults';
import type { Category, CategoryKind } from './types';

interface TimeSlot {
  /** Inclusive start hour, exclusive end hour (local time, 0–24). */
  from: number;
  to: number;
  categoryId: number;
}

export const EXPENSE_TIME_SLOTS: readonly TimeSlot[] = [
  { from: 6, to: 11, categoryId: CATEGORY_ID.chai },
  { from: 11, to: 15, categoryId: CATEGORY_ID.food },
  { from: 15, to: 19, categoryId: CATEGORY_ID.chai },
  { from: 19, to: 23, categoryId: CATEGORY_ID.food },
];

/**
 * Returns the guessed category id, or null if no sensible guess exists
 * (then nothing is pre-selected and the user simply taps one).
 */
export function guessCategory(
  now: Date,
  categories: readonly Pick<Category, 'id' | 'kind'>[],
  kind: CategoryKind,
): number | null {
  const available = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));
  // No time-of-day pattern for income; don't assume salary vs pocket money.
  if (kind === 'income') return null;
  const hour = now.getHours();
  const slot = EXPENSE_TIME_SLOTS.find((s) => hour >= s.from && hour < s.to);
  if (slot && available.has(slot.categoryId)) return slot.categoryId;
  return null;
}
