import {
  buildSchedule,
  debtStatus,
  debtTotals,
  firstDueDate,
  instalmentDate,
  knownPeople,
  planAmounts,
  repaymentsThisMonth,
  splitEvenly,
  validatePlan,
  type Debt,
} from '../debts';
import type { EffectiveTransaction } from '../types';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

let nextId = 1;
function entry(debtId: number, direction: 'in' | 'out', amount: number, when: number): EffectiveTransaction {
  return {
    id: nextId++, type: 'transfer', account_id: 1, category_id: null, bucket_id: null, amount_paise: amount,
    note: null, occurred_at: when, corrected_by: null, voided: false, to_account_id: null, debt_id: debtId, direction,
  };
}

function debt(partial: Partial<Debt>): Debt {
  return {
    id: 1, person: 'Rahul', kind: 'borrowed', months: null, per_month_paise: null, first_due: null,
    created_at: at(2026, 9, 5), ...partial,
  };
}

describe('splitEvenly / planAmounts', () => {
  it('splits to the paisa with no interest', () => {
    expect(splitEvenly(1_000_000, 3)).toEqual([333_334, 333_333, 333_333]);
    expect(splitEvenly(1_200_000, 6)).toEqual(Array(6).fill(200_000));
    const parts = splitEvenly(999_999, 7);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(999_999);
  });

  it('fixed amount per month: last instalment is what is left', () => {
    expect(planAmounts(1_000_000, { per_month_paise: 300_000 })).toEqual([300_000, 300_000, 300_000, 100_000]);
    expect(planAmounts(900_000, { per_month_paise: 300_000 })).toEqual([300_000, 300_000, 300_000]);
    expect(planAmounts(100_000, { per_month_paise: 500_000 })).toEqual([100_000]);
  });

  it('no plan → no instalments; bad plans are refused', () => {
    expect(planAmounts(100_000, {})).toEqual([]);
    expect(() => planAmounts(100_000, { months: 0 })).toThrow();
    expect(() => planAmounts(100_000, { months: 1.5 })).toThrow();
    expect(() => planAmounts(100_000, { per_month_paise: 0 })).toThrow();
    expect(() => planAmounts(100_000_000, { per_month_paise: 100 })).toThrow(/120 months/);
    expect(() => validatePlan(100_000, { months: 2, per_month_paise: 50_000 })).toThrow();
  });
});

describe('dates', () => {
  it('keeps the same day each month, clamped for short months', () => {
    const first = day(2027, 1, 31);
    expect(instalmentDate(first, 1)).toBe(day(2027, 2, 28));
    expect(instalmentDate(first, 2)).toBe(day(2027, 3, 31));
  });

  it('first due date: same date next month, or the next chosen day', () => {
    expect(firstDueDate(at(2026, 9, 29))).toBe(day(2026, 10, 29));
    expect(firstDueDate(at(2026, 9, 29), 5)).toBe(day(2026, 10, 5));
    expect(firstDueDate(at(2026, 9, 3), 5)).toBe(day(2026, 9, 5));
    expect(firstDueDate(at(2026, 9, 5), 5)).toBe(day(2026, 10, 5));
    expect(firstDueDate(at(2027, 2, 10), 31)).toBe(day(2027, 2, 28));
  });
});

describe('debtStatus — borrowed with a plan', () => {
  const d = debt({ months: 3, first_due: day(2026, 10, 5) });
  const borrowed = entry(1, 'in', 1_000_000, at(2026, 9, 5));

  it('before the first instalment: nothing due, nothing kept aside this month', () => {
    const s = debtStatus(d, [borrowed], at(2026, 9, 20));
    expect(s.principal_paise).toBe(1_000_000);
    expect(s.outstanding_paise).toBe(1_000_000);
    expect(s.schedule.map((i) => i.amount_paise)).toEqual([333_334, 333_333, 333_333]);
    expect(s.due_now_paise).toBe(0);
    expect(s.due_this_month_paise).toBe(0);
    expect(s.next?.n).toBe(1);
  });

  it('in the month of an instalment: kept aside, then due on the day', () => {
    expect(debtStatus(d, [borrowed], at(2026, 10, 1)).due_this_month_paise).toBe(333_334);
    expect(debtStatus(d, [borrowed], at(2026, 10, 1)).due_now_paise).toBe(0);
    const onDay = debtStatus(d, [borrowed], at(2026, 10, 5, 0));
    expect(onDay.due_now_paise).toBe(333_334);
    expect(onDay.schedule[0].status).toBe('due');
  });

  it('payments fill instalments in order; extra goes to the next ones', () => {
    const paid = entry(1, 'out', 400_000, at(2026, 10, 5));
    const s = debtStatus(d, [borrowed, paid], at(2026, 10, 20));
    expect(s.settled_paise).toBe(400_000);
    expect(s.outstanding_paise).toBe(600_000);
    expect(s.schedule.map((i) => i.status)).toEqual(['paid', 'part', 'upcoming']);
    expect(s.due_now_paise).toBe(0);
    expect(s.due_this_month_paise).toBe(0);
    // November: the rest of instalment 2 is due.
    expect(debtStatus(d, [borrowed, paid], at(2026, 11, 1)).due_this_month_paise).toBe(333_334 + 333_333 - 400_000);
  });

  it('missed instalments stay due (never more than what is owed)', () => {
    const s = debtStatus(d, [borrowed], at(2027, 3, 1));
    expect(s.due_now_paise).toBe(1_000_000);
    expect(s.due_this_month_paise).toBe(1_000_000);
  });

  it('fully repaid → settled, nothing kept aside', () => {
    const s = debtStatus(d, [borrowed, entry(1, 'out', 1_000_000, at(2026, 9, 6))], at(2026, 10, 5));
    expect(s.settled).toBe(true);
    expect(s.due_this_month_paise).toBe(0);
    expect(s.next).toBeNull();
  });

  it('ignores voided entries and other debts', () => {
    const gone = { ...entry(1, 'out', 500_000, at(2026, 9, 6)), voided: true };
    const other = entry(2, 'out', 100_000, at(2026, 9, 6));
    const s = debtStatus(d, [borrowed, gone, other], at(2026, 9, 7));
    expect(s.settled_paise).toBe(0);
    expect(s.entry_ids).toEqual([borrowed.id]);
  });
});

describe('lent and totals', () => {
  it('lent money: out first, back in later; never kept aside', () => {
    const lent = debt({ id: 2, kind: 'lent', person: 'Aman' });
    const s = debtStatus(lent, [entry(2, 'out', 50_000, at(2026, 9, 1)), entry(2, 'in', 20_000, at(2026, 9, 9))], at(2026, 9, 10));
    expect(s.outstanding_paise).toBe(30_000);
    expect(s.schedule).toEqual([]);
    expect(s.due_this_month_paise).toBe(0);

    const b = debtStatus(debt({ months: 1, first_due: day(2026, 9, 30) }), [entry(1, 'in', 100_000, at(2026, 9, 1))], at(2026, 9, 10));
    expect(debtTotals([s, b])).toEqual({ you_owe_paise: 100_000, owed_to_you_paise: 30_000 });
    expect(repaymentsThisMonth([s, b])).toBe(100_000);
  });

  it('knownPeople: unique names, newest first', () => {
    expect(knownPeople([
      debt({ person: 'rahul ', created_at: 1 }),
      debt({ person: 'Aman', created_at: 3 }),
      debt({ person: 'Rahul', created_at: 2 }),
    ])).toEqual(['Aman', 'Rahul']);
  });

  it('buildSchedule without a first date is empty', () => {
    expect(buildSchedule(1_000, { months: 2 }, null, 0, 0)).toEqual([]);
  });
});
