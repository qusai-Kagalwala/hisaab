/**
 * Money helpers. All money in Hisaab is an integer number of paise.
 * Never use floats for money — every function here works on integers or on
 * digit strings, and asserts integer inputs.
 */

export type Paise = number;

/** Largest amount the keypad accepts: ₹99,99,999.99 (just under ₹1 crore). */
export const MAX_INPUT_RUPEE_DIGITS = 7;
export const MAX_INPUT_DECIMALS = 2;

export function isPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertPaise(value: unknown, label = 'amount'): asserts value is Paise {
  if (!isPaise(value)) {
    throw new Error(`${label} must be an integer number of paise, got ${String(value)}`);
  }
}

/** Whole rupees → paise. Only accepts integers (use for constants and seeds). */
export function rupees(wholeRupees: number): Paise {
  assertPaise(wholeRupees, 'rupees');
  return wholeRupees * 100;
}

export function addPaise(...values: Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total, 'sum');
  return total;
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  assertPaise(a);
  assertPaise(b);
  const result = a - b;
  assertPaise(result, 'difference');
  return result;
}

// ---------------------------------------------------------------------------
// Keypad input
// ---------------------------------------------------------------------------

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

/**
 * Apply one keypad press to the amount string the user is typing.
 * The string is kept in a canonical form: no leading zeros, at most one dot,
 * at most two decimals, and a bounded number of rupee digits.
 * Invalid presses return the input unchanged.
 */
export function applyKeypadKey(input: string, key: KeypadKey): string {
  if (key === 'back') return input.slice(0, -1);

  const dot = input.indexOf('.');
  if (key === '.') {
    if (dot !== -1) return input;
    return input === '' ? '0.' : `${input}.`;
  }

  if (dot !== -1) {
    const decimals = input.length - dot - 1;
    return decimals >= MAX_INPUT_DECIMALS ? input : input + key;
  }
  if (input === '0') return key; // replace a lone leading zero
  if (input.length >= MAX_INPUT_RUPEE_DIGITS) return input;
  return input + key;
}

/**
 * Convert a keypad string ("450", "12.5", "0.05", "7.") to paise using
 * string arithmetic only. Returns 0 for empty input.
 */
export function inputToPaise(input: string): Paise {
  if (input === '' || input === '.') return 0;
  if (!/^\d*(\.\d{0,2})?$/.test(input)) {
    throw new Error(`Invalid amount input: "${input}"`);
  }
  const [whole = '', fraction = ''] = input.split('.');
  const rupeePart = whole === '' ? 0 : parseInt(whole, 10);
  const paisePart = parseInt(fraction.padEnd(2, '0'), 10);
  const result = rupeePart * 100 + paisePart;
  assertPaise(result);
  return result;
}

/** Inverse of inputToPaise, used to prefill the edit keypad. 4500 → "45", 1250 → "12.5". */
export function paiseToInput(paise: Paise): string {
  assertPaise(paise);
  if (paise < 0) throw new Error('Keypad input cannot be negative');
  const whole = Math.floor(paise / 100);
  const fraction = paise % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

// ---------------------------------------------------------------------------
// Formatting (₹ with Indian digit grouping)
// ---------------------------------------------------------------------------

/** Group a string of digits the Indian way: 1234567 → "12,34,567". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return `${groups.join(',')},${lastThree}`;
}

export interface FormatOptions {
  /** 'auto' shows paise only when non-zero (default). */
  paise?: 'auto' | 'always' | 'never';
  /** Prefix positive amounts with "+". */
  signed?: boolean;
}

/**
 * Format paise as rupees: 10000000 → "₹1,00,000", 4550 → "₹45.50".
 * With paise: 'never' the amount is truncated toward zero, not rounded, so a
 * display never shows more money than exists.
 */
export function formatINR(paise: Paise, options: FormatOptions = {}): string {
  assertPaise(paise);
  const mode = options.paise ?? 'auto';
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  let text = `₹${groupIndian(String(whole))}`;
  if (mode === 'always' || (mode === 'auto' && fraction !== 0)) {
    text += `.${String(fraction).padStart(2, '0')}`;
  }
  if (negative) return `−${text}`;
  if (options.signed && paise > 0) return `+${text}`;
  return text;
}

/** Format the raw keypad string for the big amount display, keeping a trailing dot. */
export function formatKeypadInput(input: string): string {
  if (input === '') return '₹0';
  const [whole = '', fraction] = input.split('.');
  const grouped = groupIndian(whole === '' ? '0' : whole);
  return fraction === undefined ? `₹${grouped}` : `₹${grouped}.${fraction}`;
}
