import { buildImportLines } from '../context';
import { readAiRows } from '../importAssist';
import { CATEGORY_ID, DEFAULT_CATEGORIES } from '../../engine/defaults';
import type { ImportRow } from '../../engine/csv';

const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, hidden: false }));
const failed = (raw: string, line: number): ImportRow => ({
  line, raw, ok: false, reason: 'No amount found', type: 'expense', amount_paise: 0, category_id: null, note: null,
  occurred_at: 1, duplicate: false,
});

describe('import AI help', () => {
  const rows = [failed('paid rahul bhai for momos one fifty', 1), failed('uber to office 1,240 rs', 2), failed('mom sent 2000', 3)];

  it('sends only the numbered lines, trimmed and capped', () => {
    expect(buildImportLines(['  a   b ', 'c'])).toBe('1. a b\n2. c');
    expect(buildImportLines(Array(40).fill('x')).split('\n')).toHaveLength(30);
  });

  it('keeps rows whose amount is really in the line; drops invented ones', () => {
    const reply = '```json\n' + JSON.stringify([
      { n: 1, amount: '150', type: 'expense', category: 'Food', note: 'momos' }, // not written as digits → dropped
      { n: 2, amount: '1240', type: 'expense', category: 'Transport', note: 'uber' },
      { n: 3, amount: 2000, type: 'income', category: 'Gift', note: 'from mom' },
      { n: 9, amount: '5', type: 'expense' },
    ]) + '\n```';
    const out = readAiRows(reply, rows, categories);
    expect(out.map((r) => [r.line, r.ok, r.type, r.amount_paise, r.category_id])).toEqual([
      [2, true, 'expense', 124_000, CATEGORY_ID.transport],
      [3, true, 'income', 200_000, CATEGORY_ID.gift],
    ]);
  });

  it('ignores replies that are not JSON', () => {
    expect(readAiRows('Sorry, I cannot help', rows, categories)).toEqual([]);
  });
});
