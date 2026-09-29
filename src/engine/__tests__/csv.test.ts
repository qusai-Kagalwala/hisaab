import { parseAmountText, parseCsv, parseDateText, parseImport, paiseToDecimal, transactionsCsv } from '../csv';
import { CATEGORY_ID, DEFAULT_CATEGORIES } from '../defaults';
import type { Category, EffectiveTransaction } from '../types';

const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, is_default: true, hidden: false }));
const now = new Date(2026, 8, 28, 18).getTime();
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('csv basics', () => {
  it('parses quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('formats paise for spreadsheets', () => {
    expect(paiseToDecimal(123_450)).toBe('1234.50');
    expect(paiseToDecimal(5)).toBe('0.05');
  });

  it('reads amounts with string math', () => {
    expect(parseAmountText('₹1,23,456.50')).toEqual({ paise: 12_345_650, negative: false });
    expect(parseAmountText('Rs. 450')).toEqual({ paise: 45_000, negative: false });
    expect(parseAmountText('-20')).toEqual({ paise: 2_000, negative: true });
    expect(parseAmountText('0.1')).toEqual({ paise: 10, negative: false });
    expect(parseAmountText('12.345')).toBeNull();
    expect(parseAmountText('abc')).toBeNull();
    expect(parseAmountText('0')).toBeNull();
  });

  it('reads Indian and ISO dates as local noon', () => {
    expect(parseDateText('2026-09-05', now)).toBe(noon(2026, 9, 5));
    expect(parseDateText('05/09/2026', now)).toBe(noon(2026, 9, 5));
    expect(parseDateText('5-9-26', now)).toBe(noon(2026, 9, 5));
    expect(parseDateText('05/09', now)).toBe(noon(2026, 9, 5));
    expect(parseDateText('31/02/2026', now)).toBeNull();
    expect(parseDateText('yesterday', now)).toBeNull();
  });
});

describe('import', () => {
  it('reads the budget.io export', () => {
    const text = [
      'Date,Type,Description,Category,Amount,Note,Recurring',
      '2026-09-01,income,"Salary",Salary,30000.00,"",monthly',
      '2026-09-02,expense,"Swiggy order",Food,349.50,"late night",no',
      '2026-09-03,expense,"Something",Weird stuff,20.00,"",no',
    ].join('\n');
    const { format, rows } = parseImport(text, { categories, nowMs: now });
    expect(format).toBe('csv');
    expect(rows.map((r) => [r.ok, r.type, r.amount_paise, r.category_id, r.note, r.occurred_at])).toEqual([
      [true, 'income', 3_000_000, CATEGORY_ID.salary, 'Salary', noon(2026, 9, 1)],
      [true, 'expense', 34_950, CATEGORY_ID.food, 'Swiggy order · late night', noon(2026, 9, 2)],
      [true, 'expense', 2_000, CATEGORY_ID.other, 'Something', noon(2026, 9, 3)],
    ]);
  });

  it('reads debit/credit sheets and skips what it cannot use', () => {
    const text = 'Date,Narration,Debit,Credit\n01/09/2026,Auto,50,\n02/09/2026,Refund,,120\n03/09/2026,Nothing,,\n99/99/2026,Bad,10,';
    const { rows } = parseImport(text, { categories, nowMs: now });
    expect(rows[0]).toMatchObject({ ok: true, type: 'expense', amount_paise: 5_000, category_id: CATEGORY_ID.transport });
    expect(rows[1]).toMatchObject({ ok: true, type: 'income', amount_paise: 12_000 });
    expect(rows[2]).toMatchObject({ ok: false, reason: 'No amount found' });
    expect(rows[3].ok).toBe(false);
  });

  it('refuses future dates and transfer rows', () => {
    const text = 'Date,Type,Amount\n2027-01-01,Spent,10\n2026-09-01,Transfer,10';
    const { rows } = parseImport(text, { categories, nowMs: now });
    expect(rows.map((r) => r.ok)).toEqual([false, false]);
  });

  it('reads pasted lines with an optional leading date', () => {
    const { format, rows } = parseImport('chai 20\n\n12/09 auto 50 cash\nsalary 30000\nhello', { categories, nowMs: now });
    expect(format).toBe('lines');
    expect(rows.map((r) => [r.line, r.ok, r.type, r.amount_paise, r.category_id])).toEqual([
      [1, true, 'expense', 2_000, CATEGORY_ID.chai],
      [3, true, 'expense', 5_000, CATEGORY_ID.transport],
      [4, true, 'income', 3_000_000, CATEGORY_ID.salary],
      [5, false, 'expense', 0, null],
    ]);
    expect(rows[1].occurred_at).toBe(noon(2026, 9, 12));
  });

  it('flags entries that already exist', () => {
    const existing: EffectiveTransaction[] = [{
      id: 1, type: 'expense', account_id: 1, category_id: 2, bucket_id: null, amount_paise: 2_000, note: 'chai',
      occurred_at: new Date(2026, 8, 28, 9).getTime(), corrected_by: null, voided: false,
    }];
    const { rows } = parseImport('chai 20\nchai 25', { categories, nowMs: now, existing });
    expect(rows.map((r) => r.duplicate)).toEqual([true, false]);
  });
});

describe('export', () => {
  it('writes one row per entry, oldest first, with readable types', () => {
    const base = { account_id: 1, bucket_id: null, corrected_by: null, voided: false, note: null } as const;
    const txs: EffectiveTransaction[] = [
      { ...base, id: 2, type: 'transfer', category_id: null, amount_paise: 1_000_000, occurred_at: new Date(2026, 8, 2, 9, 5).getTime(), debt_id: 7, direction: 'in' },
      { ...base, id: 1, type: 'expense', category_id: 2, amount_paise: 2_000, note: 'chai, "adrak"', occurred_at: new Date(2026, 8, 1, 8, 0).getTime() },
      { ...base, id: 3, type: 'transfer', category_id: null, amount_paise: 50_000, occurred_at: new Date(2026, 8, 3).getTime(), to_account_id: 2 },
      { ...base, id: 4, type: 'expense', category_id: 2, amount_paise: 0, voided: true, occurred_at: 0 },
    ];
    const csv = transactionsCsv(
      txs,
      [{ id: 1, name: 'Cash' }, { id: 2, name: 'UPI / Bank' }],
      [{ id: 2, name: 'Chai & Snacks' }],
      new Map([[7, { person: 'Rahul', kind: 'borrowed' as const }]]),
    );
    expect(csv.split('\n')).toEqual([
      'Date,Time,Type,Amount,Category,Account,To account / Person,Note',
      '2026-09-01,08:00,Spent,20.00,Chai & Snacks,Cash,,"chai, ""adrak"""',
      '2026-09-02,09:05,Borrowed,10000.00,,Cash,Rahul,',
      '2026-09-03,00:00,Transfer,500.00,,Cash,UPI / Bank,',
      '',
    ]);
    // Hisaab's own export imports back (transfers are skipped).
    const { rows } = parseImport(csv, { categories, nowMs: now });
    expect(rows.map((r) => r.ok)).toEqual([true, false, false]);
    expect(rows[0]).toMatchObject({ amount_paise: 2_000, category_id: CATEGORY_ID.chai });
  });
});
