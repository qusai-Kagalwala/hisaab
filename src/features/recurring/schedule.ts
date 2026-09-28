import type { RecurringRule } from '../../engine/recurring';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

export function scheduleLabel(rule: RecurringRule, anchorDay: number): string {
  return rule === 'weekly' ? `Every ${WEEKDAYS[anchorDay]}` : `Monthly on the ${ordinal(anchorDay)}`;
}
