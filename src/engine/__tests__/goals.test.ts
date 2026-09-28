import { goalEta, goalStatus, monthlyPace, monthsToReach, monthsUntil, setAsideForGoals, splitContribution, type Goal, type GoalContribution } from '../goals';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const now = day(2026, 9, 28);
const laptop: Goal = { id: 1, name: 'Laptop', target_paise: 8_000_000, target_date: null, created_at: day(2026, 1, 1), status: 'active' };
const c = (amount: number, at: number, goal_id = 1): GoalContribution => ({ id: Math.random(), goal_id, amount_paise: amount, created_at: at });

describe('goals', () => {
  it('pace = net saving over the last 90 days, per 30 days', () => {
    const contributions = [c(900_000, day(2026, 7, 5)), c(900_000, day(2026, 8, 5)), c(900_000, day(2026, 9, 5)), c(5_000_000, day(2026, 2, 1))];
    expect(monthlyPace(laptop, contributions, now)).toBe(900_000);
    expect(monthlyPace(laptop, [...contributions, c(-2_700_000, day(2026, 9, 20))], now)).toBe(0);
  });

  it('a young goal is not over-extrapolated (window is at least 30 days)', () => {
    const fresh = { ...laptop, created_at: day(2026, 9, 25) };
    expect(monthlyPace(fresh, [c(100_000, day(2026, 9, 26))], now)).toBe(100_000);
  });

  it('ETA rounds months up and the what-if extra brings it closer', () => {
    expect(monthsToReach(1_000, 300)).toBe(4);
    expect(monthsToReach(0, 0)).toBe(0);
    expect(monthsToReach(1_000, 0)).toBeNull();
    expect(goalEta(5_300_000, 900_000, now)).toBe('2027-03');
    expect(goalEta(5_300_000, 900_000, now, 50_000)).toBe('2027-03');
    expect(goalEta(5_300_000, 900_000, now, 425_000)).toBe('2027-01');
    expect(goalEta(5_300_000, 0, now)).toBeNull();
  });

  it('status sums saved, needed per month for a target date, and reached goals', () => {
    const contributions = [c(2_700_000, day(2026, 8, 1))];
    const s = goalStatus({ ...laptop, target_date: day(2027, 3, 1) }, contributions, now);
    expect(s).toMatchObject({ saved_paise: 2_700_000, remaining_paise: 5_300_000, needed_per_month_paise: Math.ceil(5_300_000 / 6) });
    expect(goalStatus(laptop, [c(9_000_000, day(2026, 9, 1))], now)).toMatchObject({ remaining_paise: 0, eta_month: '2026-09' });
    expect(monthsUntil(day(2026, 9, 30), now)).toBe(1);
  });

  it('only active goals count as set aside', () => {
    const a = goalStatus(laptop, [c(1_000, now)], now);
    const done = goalStatus({ ...laptop, id: 2, status: 'done' }, [c(5_000, now, 2)], now);
    expect(setAsideForGoals([a, done])).toBe(1_000);
  });

  it('takes contributions from Savings first, then free money', () => {
    expect(splitContribution(5_000, 3_000, 10_000)).toEqual({ fromSavings: 3_000, fromFree: 2_000 });
    expect(splitContribution(5_000, 0, 5_000)).toEqual({ fromSavings: 0, fromFree: 5_000 });
    expect(() => splitContribution(5_000, 1_000, 3_000)).toThrow();
    expect(() => splitContribution(0, 1_000, 3_000)).toThrow();
  });
});
