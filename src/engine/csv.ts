/**
 * Spreadsheet export and the optional import. Import never writes anything
 * by itself: it turns text into proposed rows that the user reviews and
 * confirms with a tap. Amounts are parsed with string math into paise.
 *
 * Reads: Hisaab's own CSV, the budget.io CSV export
 * (Date,Type,Description,Category,Amount,Note,Recurring), most simple
 * Date/Description/Amount or Debit/Credit sheets, and plain pasted lines
 * like "chai 20" or "12/09 auto 50".
 */
import { CATEGORY_ID } from './defaults';
import { addPaise, assertPaise, inputToPaise, type Paise } from './money';
import { parseEntry, type MerchantMemory } from './parser';
import type { Account, Category, EffectiveTransaction } from './types';

// ---------------------------------------------------------------------------
// CSV basics
// ---------------------------------------------------------------------------

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** "1234.50" — plain, no grouping, for spreadsheets. */
export function paiseToDecimal(paise: Paise): string {
  assertPaise(paise);
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CSV_HEADER = ['Date', 'Time', 'Type', 'Amount', 'Category', 'Account', 'To account / Person', 'Note'];

const pad = (n: number) => String(n).padStart(2, '0');

export function transactionsCsv(
  transactions: readonly EffectiveTransaction[],
  accounts: readonly Pick<Account, 'id' | 'name'>[],
  categories: readonly Pick<Category, 'id' | 'name'>[],
  people: ReadonlyMap<number, { person: string; kind: 'borrowed' | 'lent' }>,
): string {
  const accountName = (id: number | null | undefined) => accounts.find((a) => a.id === id)?.name ?? '';
  const rows = [...transactions]
    .filter((t) => !t.voided)
    .sort((a, b) => a.occurred_at - b.occurred_at || a.id - b.id)
    .map((t) => {
      const d = new Date(t.occurred_at);
      let type: string = t.type === 'income' ? 'Money in' : t.type === 'expense' ? 'Spent' : 'Transfer';
      let other = accountName(t.to_account_id);
      if (t.debt_id != null) {
        const debt = people.get(t.debt_id);
        other = debt?.person ?? '';
        if (debt?.kind === 'borrowed') type = t.direction === 'in' ? 'Borrowed' : 'Repaid';
        else type = t.direction === 'out' ? 'Lent' : 'Got back';
      }
      return [
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        type,
        paiseToDecimal(t.amount_paise),
        categories.find((c) => c.id === t.category_id)?.name ?? '',
        accountName(t.account_id),
        other,
        t.note ?? '',
      ];
    });
  return [CSV_HEADER, ...rows].map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

export function csvFileName(nowMs: number): string {
  const d = new Date(nowMs);
  return `hisaab-entries-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportRow {
  /** 1-based line in the source. */
  line: number;
  raw: string;
  ok: boolean;
  /** Why the row can't be imported (when !ok). */
  reason?: string;
  type: 'expense' | 'income';
  amount_paise: Paise;
  category_id: number | null;
  note: string | null;
  occurred_at: number;
  /** Looks like an entry that is already in Hisaab. */
  duplicate: boolean;
}

/** "₹1,23,456.50", "Rs. 450", "-20", "1,000.0" → paise (sign returned separately). */
export function parseAmountText(text: string): { paise: Paise; negative: boolean } | null {
  let t = text.trim().replace(/^\((.*)\)$/, '-$1');
  const negative = /^-|-$|\bdr\b/i.test(t);
  t = t.replace(/₹|rs\.?|inr|cr|dr|\s|,|-|\+/gi, '');
  if (!/^\d+(\.\d{1,2})?$|^\d*\.\d{1,2}$/.test(t)) return null;
  const paise = inputToPaise(t.startsWith('.') ? `0${t}` : t);
  return paise > 0 ? { paise, negative } : null;
}

/**
 * Local date at noon (so a date never slips a day). Accepts 2026-09-28,
 * 28/09/2026, 28-09-2026, 28.09.26 and 28/09 (this year).
 */
export function parseDateText(text: string, nowMs: number): number | null {
  const t = text.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?(?:\s.*)?$/.exec(t))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = match[3] == null ? new Date(nowMs).getFullYear() : Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12);
  if (date.getMonth() !== m - 1) return null;
  return date.getTime();
}

type Column = 'date' | 'type' | 'amount' | 'debit' | 'credit' | 'description' | 'category' | 'note';

const COLUMN_NAMES: Record<Column, string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'when'],
  type: ['type', 'kind', 'cr/dr', 'dr/cr'],
  amount: ['amount', 'amt', 'value', 'rs', 'inr', '₹'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'spent', 'paid', 'out'],
  credit: ['credit', 'deposit', 'deposits', 'received', 'in'],
  description: ['description', 'desc', 'details', 'narration', 'particulars', 'merchant', 'name', 'title', 'item'],
  category: ['category', 'cat'],
  note: ['note', 'notes', 'remark', 'remarks', 'memo'],
};

function detectColumns(header: readonly string[]): Partial<Record<Column, number>> | null {
  const found: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [col, names] of Object.entries(COLUMN_NAMES) as [Column, string[]][]) {
      if (found[col] == null && names.includes(key)) {
        found[col] = i;
        return;
      }
    }
  });
  const hasMoney = found.amount != null || found.debit != null || found.credit != null;
  return hasMoney ? found : null;
}

function typeFromText(text: string | undefined): 'expense' | 'income' | 'skip' | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['expense', 'spent', 'debit', 'dr', 'out', 'paid', 'payment'].includes(t)) return 'expense';
  if (['income', 'money in', 'credit', 'cr', 'in', 'received'].includes(t)) return 'income';
  if (['transfer', 'borrowed', 'repaid', 'lent', 'got back'].includes(t)) return 'skip';
  return null;
}

export interface ImportContext {
  categories: readonly Pick<Category, 'id' | 'name' | 'keywords' | 'hidden' | 'kind'>[];
  memory?: readonly MerchantMemory[];
  existing?: readonly EffectiveTransaction[];
  nowMs: number;
}

function pickCategory(
  ctx: ImportContext,
  kind: 'expense' | 'income',
  categoryText: string,
  description: string,
): number {
  const byName = ctx.categories.find(
    (c) => !c.hidden && c.kind === kind && c.name.toLowerCase() === categoryText.trim().toLowerCase(),
  );
  if (byName) return byName.id;
  const sameKind = ctx.categories.filter((c) => c.kind === kind);
  const guess = parseEntry(`${categoryText} ${description}`, sameKind, ctx.memory ?? []).category_id;
  if (guess != null) return guess;
  return kind === 'income' ? CATEGORY_ID.otherIncome : CATEGORY_ID.other;
}

function markDuplicates(rows: ImportRow[], existing: readonly EffectiveTransaction[]): ImportRow[] {
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const seen = new Set(
    existing
      .filter((t) => !t.voided && (t.type === 'income' || t.type === 'expense'))
      .map((t) => `${dayKey(t.occurred_at)}|${t.type}|${t.amount_paise}|${(t.note ?? '').toLowerCase()}`),
  );
  return rows.map((r) =>
    r.ok && seen.has(`${dayKey(r.occurred_at)}|${r.type}|${r.amount_paise}|${(r.note ?? '').toLowerCase()}`)
      ? { ...r, duplicate: true }
      : r,
  );
}

function failed(line: number, raw: string, reason: string, nowMs: number): ImportRow {
  return {
    line, raw, ok: false, reason, type: 'expense', amount_paise: 0, category_id: null, note: null,
    occurred_at: nowMs, duplicate: false,
  };
}

function importCsvRows(rows: string[][], cols: Partial<Record<Column, number>>, ctx: ImportContext): ImportRow[] {
  const get = (r: string[], c: Column) => (cols[c] == null ? '' : r[cols[c]!] ?? '');
  return rows.slice(1).map((r, i) => {
    const line = i + 2;
    const raw = r.join(', ');
    let amount: { paise: Paise; negative: boolean } | null = null;
    let type = typeFromText(get(r, 'type'));
    if (type === 'skip') return failed(line, raw, "Transfers and borrow/lend aren't imported — add those in the app", ctx.nowMs);
    if (cols.amount != null) {
      amount = parseAmountText(get(r, 'amount'));
      if (amount && type == null) type = amount.negative ? 'expense' : null;
    }
    if (!amount) {
      const debit = parseAmountText(get(r, 'debit'));
      const credit = parseAmountText(get(r, 'credit'));
      if (debit) [amount, type] = [debit, 'expense'];
      else if (credit) [amount, type] = [credit, 'income'];
    }
    if (!amount) return failed(line, raw, 'No amount found', ctx.nowMs);
    const kind = type ?? 'expense';
    const dateText = get(r, 'date');
    const date = dateText ? parseDateText(dateText, ctx.nowMs) : ctx.nowMs;
    if (date == null) return failed(line, raw, `Couldn't read the date "${dateText}"`, ctx.nowMs);
    if (date > ctx.nowMs + 36 * 3_600_000) return failed(line, raw, 'Date is in the future', ctx.nowMs);
    const description = get(r, 'description');
    const extra = get(r, 'note');
    const note = [description, extra].filter((s) => s.trim()).join(' · ') || null;
    return {
      line, raw, ok: true, type: kind, amount_paise: amount.paise,
      category_id: pickCategory(ctx, kind, get(r, 'category'), description),
      note: note?.slice(0, 120) ?? null, occurred_at: date, duplicate: false,
    };
  });
}

const LEADING_DATE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}(?:[/.-](?:\d{4}|\d{2}))?)\s+/;

function importLines(text: string, ctx: ImportContext): ImportRow[] {
  const out: ImportRow[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    let rest = raw;
    let date = ctx.nowMs;
    const m = LEADING_DATE.exec(raw);
    if (m) {
      const parsed = parseDateText(m[1], ctx.nowMs);
      if (parsed == null) {
        out.push(failed(i + 1, raw, `Couldn't read the date "${m[1]}"`, ctx.nowMs));
        return;
      }
      date = parsed;
      rest = raw.slice(m[0].length);
    }
    const parsed = parseEntry(rest, ctx.categories, ctx.memory ?? []);
    if (!parsed.amount_paise) {
      out.push(failed(i + 1, raw, 'No amount found', ctx.nowMs));
      return;
    }
    const category = ctx.categories.find((c) => c.id === parsed.category_id);
    const kind = category?.kind ?? 'expense';
    out.push({
      line: i + 1, raw, ok: true, type: kind, amount_paise: parsed.amount_paise,
      category_id: category?.id ?? CATEGORY_ID.other, note: parsed.note || null, occurred_at: date, duplicate: false,
    });
  });
  return out;
}

/** Turn pasted text or a CSV file into rows to review. Nothing is saved here. */
export function parseImport(text: string, ctx: ImportContext): { format: 'csv' | 'lines'; rows: ImportRow[] } {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (firstLine.includes(',')) {
    const table = parseCsv(text);
    const cols = table.length > 0 ? detectColumns(table[0]) : null;
    if (cols) return { format: 'csv', rows: markDuplicates(importCsvRows(table, cols, ctx), ctx.existing ?? []) };
  }
  return { format: 'lines', rows: markDuplicates(importLines(text, ctx), ctx.existing ?? []) };
}

/** Totals of the rows the user picked, for the "Import 12 entries" summary. */
export function importTotals(rows: readonly ImportRow[]): { count: number; spent_paise: Paise; in_paise: Paise } {
  return {
    count: rows.length,
    spent_paise: addPaise(...rows.filter((r) => r.type === 'expense').map((r) => r.amount_paise)),
    in_paise: addPaise(...rows.filter((r) => r.type === 'income').map((r) => r.amount_paise)),
  };
}
