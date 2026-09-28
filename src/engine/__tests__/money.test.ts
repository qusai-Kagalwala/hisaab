import {
  addPaise,
  applyKeypadKey,
  formatINR,
  formatKeypadInput,
  groupIndian,
  inputToPaise,
  normalizeAmountText,
  paiseToInput,
  rupees,
  subtractPaise,
  type KeypadKey,
} from '../money';

function type(keys: string): string {
  let input = '';
  for (const k of keys) input = applyKeypadKey(input, k as KeypadKey);
  return input;
}

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['99999', '99,999'],
    ['100000', '1,00,000'],
    ['1234567', '12,34,567'],
    ['100000000', '10,00,00,000'],
  ])('%s → %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe('formatINR', () => {
  it('formats whole rupees with Indian grouping', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(4_000)).toBe('₹40');
    expect(formatINR(10_000_000)).toBe('₹1,00,000');
  });

  it('shows paise only when present in auto mode', () => {
    expect(formatINR(4_550)).toBe('₹45.50');
    expect(formatINR(5)).toBe('₹0.05');
    expect(formatINR(4_500, { paise: 'always' })).toBe('₹45.00');
    expect(formatINR(4_599, { paise: 'never' })).toBe('₹45');
  });

  it('handles signs', () => {
    expect(formatINR(-12_345_600)).toBe('−₹1,23,456');
    expect(formatINR(2_000, { signed: true })).toBe('+₹20');
    expect(formatINR(0, { signed: true })).toBe('₹0');
  });

  it('rejects non-integer paise', () => {
    expect(() => formatINR(1.5)).toThrow();
    expect(() => formatINR(NaN)).toThrow();
  });
});

describe('keypad input', () => {
  it('builds amounts digit by digit', () => {
    expect(type('40')).toBe('40');
    expect(type('0040')).toBe('40');
    expect(type('12.5')).toBe('12.5');
    expect(type('.5')).toBe('0.5');
  });

  it('allows at most one dot and two decimals', () => {
    expect(type('1.2.3')).toBe('1.23');
    expect(type('9.999')).toBe('9.99');
  });

  it('caps the number of rupee digits', () => {
    expect(type('123456789')).toBe('1234567');
  });

  it('supports backspace', () => {
    expect(applyKeypadKey('12.5', 'back')).toBe('12.');
    expect(applyKeypadKey('', 'back')).toBe('');
  });

  it('converts input to paise without floats', () => {
    expect(inputToPaise('')).toBe(0);
    expect(inputToPaise('40')).toBe(4_000);
    expect(inputToPaise('12.5')).toBe(1_250);
    expect(inputToPaise('0.05')).toBe(5);
    expect(inputToPaise('7.')).toBe(700);
    // 0.1 + 0.2 style float traps do not apply
    expect(inputToPaise('0.29')).toBe(29);
    expect(inputToPaise('1234567.99')).toBe(123_456_799);
    expect(() => inputToPaise('1.234')).toThrow();
    expect(() => inputToPaise('abc')).toThrow();
  });

  it('round-trips paise to input', () => {
    for (const p of [0, 5, 50, 1_250, 4_000, 123_456_799]) {
      expect(inputToPaise(paiseToInput(p))).toBe(p);
    }
    expect(paiseToInput(1_250)).toBe('12.5');
    expect(paiseToInput(1_205)).toBe('12.05');
  });

  it('formats the live display', () => {
    expect(formatKeypadInput('')).toBe('₹0');
    expect(formatKeypadInput('100000')).toBe('₹1,00,000');
    expect(formatKeypadInput('1500.')).toBe('₹1,500.');
    expect(formatKeypadInput('1500.5')).toBe('₹1,500.5');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts integers only', () => {
    expect(addPaise(10, 20, 30)).toBe(60);
    expect(addPaise()).toBe(0);
    expect(subtractPaise(100, 250)).toBe(-150);
    expect(rupees(40)).toBe(4_000);
    expect(() => addPaise(0.1, 0.2)).toThrow();
    expect(() => rupees(1.5)).toThrow();
  });
});

describe('normalizeAmountText', () => {
  it('cleans typed text into keypad input', () => {
    expect(normalizeAmountText('₹1,50,000')).toBe('150000');
    expect(normalizeAmountText('12.345')).toBe('12.34');
    expect(normalizeAmountText('0012')).toBe('12');
    expect(normalizeAmountText('abc')).toBe('');
  });
});
