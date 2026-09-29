/**
 * Optional AI help for Import: reads pasted lines the offline reader
 * couldn't understand. The AI only transcribes — every amount it returns
 * must appear, digit for digit, in the user's own line, or it is dropped.
 * Nothing is saved here: rows go back to the review screen.
 */
import { CATEGORY_ID } from '../engine/defaults';
import { parseAmountText, type ImportRow } from '../engine/csv';
import type { Category } from '../engine/types';
import { aiReady, type AiConfig } from './assistant';
import { buildImportLines, IMPORT_AI_MAX_LINES } from './context';
import { chainFor, runWithFallback } from './fallback';
import { generate, type FetchLike } from './gemini';

interface AiRow {
  n?: unknown;
  amount?: unknown;
  type?: unknown;
  category?: unknown;
  note?: unknown;
}

function system(categoryNames: readonly string[]): string {
  return [
    'You read short notes about personal expenses and income written by an Indian user (English, Hindi or Hinglish).',
    'Return ONLY a JSON array. For each numbered line that is a money entry, add one object:',
    '{"n": line number, "amount": the amount exactly as written in the line (digits only, no ₹ or commas),',
    ' "type": "expense" or "income", "category": one of the allowed categories, "note": a 1-4 word description}.',
    'Never calculate, add up or change an amount. Skip lines without an amount.',
    `Allowed categories: ${categoryNames.join(', ')}.`,
  ].join('\n');
}

const digits = (s: string) => s.replace(/[^\d.]/g, '');

/** Parse the AI's JSON and keep only rows whose amount is really in the line. */
export function readAiRows(
  text: string,
  failed: readonly ImportRow[],
  categories: readonly Pick<Category, 'id' | 'name' | 'kind' | 'hidden'>[],
): ImportRow[] {
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let rows: AiRow[];
  try {
    const parsed: unknown = JSON.parse(json);
    rows = Array.isArray(parsed) ? (parsed as AiRow[]) : [];
  } catch {
    return [];
  }
  const out: ImportRow[] = [];
  for (const r of rows) {
    const source = typeof r.n === 'number' ? failed[r.n - 1] : undefined;
    if (!source || typeof r.amount !== 'string' && typeof r.amount !== 'number') continue;
    const amountText = String(r.amount);
    // Grounding: the exact digits must be in what the user wrote (ignoring commas/spaces).
    if (!digits(amountText) || !source.raw.replace(/[,\s]/g, '').includes(digits(amountText))) continue;
    const amount = parseAmountText(amountText);
    if (!amount) continue;
    const type = r.type === 'income' ? 'income' : 'expense';
    const category = categories.find(
      (c) => !c.hidden && c.kind === type && typeof r.category === 'string' && c.name.toLowerCase() === r.category.toLowerCase(),
    );
    out.push({
      ...source,
      ok: true,
      reason: undefined,
      type,
      amount_paise: amount.paise,
      category_id: category?.id ?? (type === 'income' ? CATEGORY_ID.otherIncome : CATEGORY_ID.other),
      note: typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 60) : null,
      duplicate: false,
    });
  }
  return out;
}

export async function aiReadLines(
  failed: readonly ImportRow[],
  categories: readonly Pick<Category, 'id' | 'name' | 'kind' | 'hidden'>[],
  config: AiConfig,
  fetchImpl?: FetchLike,
): Promise<ImportRow[]> {
  if (!aiReady(config)) throw new Error('Turn on AI in Settings first.');
  const lines = failed.slice(0, IMPORT_AI_MAX_LINES);
  const names = categories.filter((c) => !c.hidden).map((c) => c.name);
  const { result } = await runWithFallback(chainFor('light', config.models), (m) =>
    generate(config.apiKey!, {
      model: m, system: system(names), prompt: buildImportLines(lines.map((l) => l.raw)), maxOutputTokens: 1200, temperature: 0,
    }, fetchImpl),
  );
  return readAiRows(result, lines, categories);
}
