/**
 * Local-time calendar helpers. Dates are handled as epoch ms at local
 * midnight; months as 'YYYY-MM' keys.
 */

export type MonthKey = string;

export function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export function monthKey(ms: number): MonthKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(key: MonthKey): { year: number; month0: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid month key "${key}"`);
  return { year: Number(match[1]), month0: Number(match[2]) - 1 };
}

export function monthStartMs(key: MonthKey): number {
  const { year, month0 } = parseMonth(key);
  return new Date(year, month0, 1).getTime();
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { year, month0 } = parseMonth(key);
  return monthKey(new Date(year, month0 + delta, 1).getTime());
}

/** Days left in the month including today (1 on the last day). */
export function daysLeftInMonth(nowMs: number): number {
  const d = new Date(nowMs);
  return daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export function monthName(key: MonthKey): string {
  return MONTH_NAMES[parseMonth(key).month0];
}

/** "March 2027" */
export function monthLabel(key: MonthKey): string {
  return `${monthName(key)} ${key.slice(0, 4)}`;
}
