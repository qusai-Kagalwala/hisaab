/**
 * Savings: money handed over (e.g. to family). It leaves an account as a
 * Savings transfer and then belongs to no account (see engine/spotlight).
 *
 * Before 1.4, Savings was a separate list of amounts (savings_moves) that
 * stayed inside the accounts. That "legacy" amount is still honoured until the
 * user says which account it came out of (settleLegacySavings).
 */
import { assertPaise, type Paise } from '../engine/money';
import { canTakeFromSavings } from '../engine/spotlight';
import type { Db } from './types';

/** Savings recorded the old way (still inside the accounts). */
export async function savingsBalance(db: Db): Promise<Paise> {
  const row = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paise), 0) AS total FROM savings_moves');
  return row?.total ?? 0;
}

/** Positive = add to savings, negative = take out. Old model; kept for backups and tests. */
export async function addSavingsMove(db: Db, amount: Paise, note?: string | null, nowMs = Date.now()): Promise<number> {
  assertPaise(amount);
  if (amount === 0) throw new Error('Enter an amount');
  const result = await db.runAsync(
    'INSERT INTO savings_moves (amount_paise, note, created_at) VALUES (?, ?, ?)',
    amount, note?.trim() || null, nowMs,
  );
  return result.lastInsertRowId;
}

/** Undo an old-style move — refused if it would leave Savings below zero. */
export async function undoSavingsMove(db: Db, id: number): Promise<boolean> {
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount_paise), 0) AS total FROM savings_moves WHERE id != ?', id,
  );
  if ((row?.total ?? 0) < 0) return false;
  const result = await db.runAsync('DELETE FROM savings_moves WHERE id = ?', id);
  return result.changes === 1;
}

export interface SavingsTransferInput {
  account_id: number;
  amount_paise: Paise;
  /** 'out' = put into Savings from the account; 'in' = take back into it. */
  direction: 'in' | 'out';
  note?: string | null;
  created_at?: number;
  /** Required when taking back: what Savings holds now (from the snapshot). */
  available_paise?: Paise;
}

/** Put money into Savings from an account, or take it back. Returns the transaction id. */
export async function addSavingsTransfer(db: Db, t: SavingsTransferInput): Promise<number> {
  assertPaise(t.amount_paise);
  if (t.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  if (t.direction === 'in' && !canTakeFromSavings(t.available_paise ?? 0, t.amount_paise)) {
    throw new Error('That is more than what is in Savings');
  }
  const result = await db.runAsync(
    `INSERT INTO transactions (account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id,
                               to_account_id, debt_id, direction)
     VALUES (?, NULL, NULL, ?, 'transfer', ?, ?, NULL, NULL, NULL, ?)`,
    t.account_id, t.amount_paise, t.note?.trim() || null, t.created_at ?? Date.now(), t.direction,
  );
  return result.lastInsertRowId;
}

/**
 * The one-time "Which account was it in?" step: the old Savings amount leaves
 * `accountId` as a Savings transfer, and the old list is zeroed. The Savings
 * total stays the same; that account's balance goes down. Returns the new
 * transfer id, or null when there was nothing to settle.
 */
export async function settleLegacySavings(db: Db, accountId: number, nowMs = Date.now()): Promise<number | null> {
  let txId: number | null = null;
  await db.withTransactionAsync(async () => {
    const legacy = await savingsBalance(db);
    if (legacy <= 0) return;
    txId = await addSavingsTransfer(db, {
      account_id: accountId, amount_paise: legacy, direction: 'out', note: 'Savings from before', created_at: nowMs,
    });
    await addSavingsMove(db, -legacy, 'Moved out of an account', nowMs);
  });
  return txId;
}
