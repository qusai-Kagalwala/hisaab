import { addDays, daysInMonth, daysLeftInMonth, monthKey, monthName, monthStartMs, shiftMonth, startOfDayMs } from '../calendar';

describe('calendar', () => {
  it('builds month keys and shifts across years', () => {
    expect(monthKey(new Date(2026, 8, 28, 23, 59).getTime())).toBe('2026-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthStartMs('2026-09')).toBe(new Date(2026, 8, 1).getTime());
    expect(monthName('2026-09')).toBe('September');
    expect(() => monthStartMs('2026-9')).toThrow();
  });

  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(30);
  });

  it('counts days left including today', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 28, 10).getTime())).toBe(3);
    expect(daysLeftInMonth(new Date(2026, 8, 30, 23).getTime())).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 9, 1).getTime())).toBe(31);
  });

  it('adds days at local midnight', () => {
    expect(startOfDayMs(new Date(2026, 8, 28, 15, 30).getTime())).toBe(new Date(2026, 8, 28).getTime());
    expect(addDays(new Date(2026, 8, 30).getTime(), 1)).toBe(new Date(2026, 9, 1).getTime());
  });
});
