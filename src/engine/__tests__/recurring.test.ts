import {
  collectDue,
  firstDueDate,
  MAX_CATCH_UP,
  monthlyOccurrence,
  nextDueAfter,
  reservedThisMonth,
  type Recurring,
} from '../recurring';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

function rule(partial: Partial<Recurring>): Recurring {
  return {
    id: 1, type: 'expense', name: 'Rent', amount_paise: 800_000, account_id: 1, category_id: 7,
    rule: 'monthly', anchor_day: 5, next_due: day(2026, 10, 5), active: true, ...partial,
  };
}

describe('monthly dates', () => {
  it('clamps the 31st to short months', () => {
    expect(monthlyOccurrence(2026, 8, 31)).toBe(day(2026, 9, 30));
    expect(monthlyOccurrence(2026, 1, 31)).toBe(day(2026, 2, 28));
    expect(nextDueAfter('monthly', 31, day(2026, 9, 30))).toBe(day(2026, 10, 31));
    expect(nextDueAfter('monthly', 31, day(2026, 12, 31))).toBe(day(2027, 1, 31));
  });

  it('first due is today if it matches, else the next one', () => {
    expect(firstDueDate('monthly', 28, day(2026, 9, 28) + 5 * 3600_000)).toBe(day(2026, 9, 28));
    expect(firstDueDate('monthly', 1, day(2026, 9, 28))).toBe(day(2026, 10, 1));
    expect(firstDueDate('monthly', 30, day(2026, 9, 28))).toBe(day(2026, 9, 30));
  });
});

describe('weekly dates', () => {
  it('finds the next weekday', () => {
    // 28 Sep 2026 is a Monday
    expect(firstDueDate('weekly', 1, day(2026, 9, 28))).toBe(day(2026, 9, 28));
    expect(firstDueDate('weekly', 0, day(2026, 9, 28))).toBe(day(2026, 10, 4));
    expect(nextDueAfter('weekly', 1, day(2026, 9, 28))).toBe(day(2026, 10, 5));
  });

  it('rejects invalid days', () => {
    expect(() => firstDueDate('weekly', 7, day(2026, 9, 28))).toThrow();
    expect(() => firstDueDate('monthly', 0, day(2026, 9, 28))).toThrow();
  });
});

describe('collectDue', () => {
  it('returns nothing before the due date', () => {
    expect(collectDue(rule({}), day(2026, 10, 4)).dueDates).toEqual([]);
  });

  it('returns the due date on the day and advances', () => {
    const r = collectDue(rule({}), day(2026, 10, 5) + 3600_000);
    expect(r.dueDates).toEqual([day(2026, 10, 5)]);
    expect(r.nextDue).toBe(day(2026, 11, 5));
  });

  it('catches up missed months as separate items, capped', () => {
    expect(collectDue(rule({}), day(2026, 12, 20)).dueDates).toHaveLength(3);
    expect(collectDue(rule({ rule: 'weekly', anchor_day: 1, next_due: day(2025, 1, 6) }), day(2026, 9, 28)).dueDates)
      .toHaveLength(MAX_CATCH_UP);
  });

  it('ignores paused rules', () => {
    expect(collectDue(rule({ active: false }), day(2026, 12, 20)).dueDates).toEqual([]);
  });
});

describe('reservedThisMonth', () => {
  const now = day(2026, 9, 10);
  it('counts upcoming bills this month and pending bills, never income', () => {
    const rules = [
      rule({ id: 1, next_due: day(2026, 9, 25), amount_paise: 50_000 }),
      rule({ id: 2, rule: 'weekly', anchor_day: 4, next_due: day(2026, 9, 17), amount_paise: 10_000 }), // 17, 24 Sep
      rule({ id: 3, next_due: day(2026, 10, 5) }), // next month
      rule({ id: 4, type: 'income', next_due: day(2026, 9, 30) }),
      rule({ id: 5, active: false, next_due: day(2026, 9, 20) }),
    ];
    const pending = [
      { id: 1, recurring_id: 9, due_date: day(2026, 9, 1), status: 'pending' as const, transaction_id: null, amount_paise: 30_000, type: 'expense' as const },
      { id: 2, recurring_id: 9, due_date: day(2026, 9, 1), status: 'pending' as const, transaction_id: null, amount_paise: 99_000, type: 'income' as const },
      { id: 3, recurring_id: 9, due_date: day(2026, 8, 1), status: 'skipped' as const, transaction_id: null, amount_paise: 77_000, type: 'expense' as const },
    ];
    expect(reservedThisMonth(rules, pending, now)).toBe(50_000 + 20_000 + 30_000);
  });
});
