import { guessCategory } from '../categoryGuess';
import { CATEGORY_ID, DEFAULT_CATEGORIES } from '../defaults';

const at = (hour: number, minute = 0) => new Date(2026, 8, 28, hour, minute);

describe('guessCategory', () => {
  it.each([
    [7, CATEGORY_ID.chai],
    [10, CATEGORY_ID.chai],
    [11, CATEGORY_ID.food],
    [13, CATEGORY_ID.food],
    [16, CATEGORY_ID.chai],
    [20, CATEGORY_ID.food],
  ])('at %i:00 guesses category %i', (hour, expected) => {
    expect(guessCategory(at(hour), DEFAULT_CATEGORIES, 'expense')).toBe(expected);
  });

  it('makes no guess late at night', () => {
    expect(guessCategory(at(23, 30), DEFAULT_CATEGORIES, 'expense')).toBeNull();
    expect(guessCategory(at(3), DEFAULT_CATEGORIES, 'expense')).toBeNull();
  });

  it('never guesses income categories', () => {
    expect(guessCategory(at(9), DEFAULT_CATEGORIES, 'income')).toBeNull();
  });

  it('returns null if the guessed category no longer exists', () => {
    const withoutChai = DEFAULT_CATEGORIES.filter((c) => c.id !== CATEGORY_ID.chai);
    expect(guessCategory(at(8), withoutChai, 'expense')).toBeNull();
  });
});
