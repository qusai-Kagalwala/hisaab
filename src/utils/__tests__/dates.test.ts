import { dayLabel, timeLabel } from '../dates';

const now = new Date(2026, 8, 28, 14, 0); // Mon 28 Sep 2026

describe('dayLabel', () => {
  it('uses friendly relative labels', () => {
    expect(dayLabel(new Date(2026, 8, 28, 0, 1).getTime(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 8, 27, 23, 59).getTime(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 8, 26, 12).getTime(), now)).toBe('Sat, 26 Sep');
    expect(dayLabel(new Date(2025, 11, 31, 12).getTime(), now)).toBe('Wed, 31 Dec 2025');
  });

  it('handles yesterday across a month boundary', () => {
    const first = new Date(2026, 9, 1, 9);
    expect(dayLabel(new Date(2026, 8, 30, 20).getTime(), first)).toBe('Yesterday');
  });
});

describe('timeLabel', () => {
  it('formats 12-hour time', () => {
    expect(timeLabel(new Date(2026, 8, 28, 0, 5).getTime())).toBe('12:05 am');
    expect(timeLabel(new Date(2026, 8, 28, 9, 30).getTime())).toBe('9:30 am');
    expect(timeLabel(new Date(2026, 8, 28, 12, 0).getTime())).toBe('12:00 pm');
    expect(timeLabel(new Date(2026, 8, 28, 21, 45).getTime())).toBe('9:45 pm');
  });
});
