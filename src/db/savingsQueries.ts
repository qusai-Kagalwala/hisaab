/** Savings: money put aside (+) or taken back (−). The balance is always the sum. */
import { assertPaise, type Paise } from '../engine/money';
import type { Db } from './types';

export async function savingsBalance(db: Db): Promise<Paise> {
  const row = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM savings_moves');
  return row?.total ?? 0;
}

/** Positive = add to savings, negative = take out. Returns the new row id (for undo). */
export async function addSavingsMove(db: Db, amount: Paise, note?: string | null, nowMs = Date.now()): Promise<number> {
  assertPaise(amount);
  if (amount === 0) throw new Error('Enter an amount');
  const result = await db.runAsync(
    'INSERT INTO savings_moves (amount_paise, note, created_at) VALUES (?, ?, ?)',
    amount, note?.trim() || null, nowMs,
  );
  return result.lastInsertRowId;
}

/** Undo a move — refused if it would leave Savings below zero (money already taken out). */
export async function undoSavingsMove(db: Db, id: number): Promise<boolean> {
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount_paise), 0) AS total FROM savings_moves WHERE id != ?', id,
  );
  if ((row?.total ?? 0) < 0) return false;
  const result = await db.runAsync('DELETE FROM savings_moves WHERE id = ?', id);
  return result.changes === 1;
}
