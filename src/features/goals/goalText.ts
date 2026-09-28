import { monthName, type MonthKey } from '../../engine/calendar';

/** "March 2027" */
export function monthLabel(key: MonthKey): string {
  return `${monthName(key)} ${key.slice(0, 4)}`;
}
