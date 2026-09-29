/** Data access for Phase 3: goals, merchant memory, chat history. */
import type { Goal, GoalContribution } from '../engine/goals';
import { assertPaise, type Paise } from '../engine/money';
import { merchantPattern, type MerchantMemory } from '../engine/parser';
import type { Db } from './types';

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function listGoals(db: Db): Promise<Goal[]> {
  return db.getAllAsync<Goal>(
    "SELECT id, name, target_paise, target_date, created_at, status FROM goals WHERE status != 'removed' ORDER BY status, created_at",
  );
}

export function listContributions(db: Db): Promise<GoalContribution[]> {
  return db.getAllAsync<GoalContribution>(
    'SELECT id, goal_id, amount_paise, created_at FROM goal_contributions ORDER BY created_at, id',
  );
}

export async function addGoal(
  db: Db,
  goal: { name: string; target_paise: Paise; target_date: number | null },
  nowMs = Date.now(),
): Promise<number> {
  const name = goal.name.trim();
  if (!name) throw new Error('Goal name is required');
  assertPaise(goal.target_paise);
  if (goal.target_paise <= 0) throw new Error('Target must be greater than zero');
  const r = await db.runAsync(
    "INSERT INTO goals (name, target_paise, target_date, created_at, status) VALUES (?, ?, ?, ?, 'active')",
    name, goal.target_paise, goal.target_date, nowMs,
  );
  return r.lastInsertRowId;
}

export async function updateGoal(
  db: Db,
  id: number,
  goal: { name: string; target_paise: Paise; target_date: number | null },
): Promise<void> {
  const name = goal.name.trim();
  if (!name) throw new Error('Goal name is required');
  assertPaise(goal.target_paise);
  if (goal.target_paise <= 0) throw new Error('Target must be greater than zero');
  await db.runAsync('UPDATE goals SET name = ?, target_paise = ?, target_date = ? WHERE id = ?',
    name, goal.target_paise, goal.target_date, id);
}

/** Append a contribution (negative releases money back). Returns its id. */
export async function addContribution(db: Db, goalId: number, amount: Paise, nowMs = Date.now()): Promise<number> {
  assertPaise(amount);
  if (amount === 0) throw new Error('Amount cannot be zero');
  const r = await db.runAsync(
    'INSERT INTO goal_contributions (goal_id, amount_paise, created_at) VALUES (?, ?, ?)', goalId, amount, nowMs,
  );
  return r.lastInsertRowId;
}

/** Undo within the toast window. */
export async function deleteContribution(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM goal_contributions WHERE id = ?', id);
}

export async function setGoalStatus(db: Db, id: number, status: Goal['status']): Promise<void> {
  await db.runAsync('UPDATE goals SET status = ? WHERE id = ?', status, id);
}

// ---------------------------------------------------------------------------
// Merchant memory
// ---------------------------------------------------------------------------

export function listMerchantMemory(db: Db): Promise<MerchantMemory[]> {
  return db.getAllAsync<MerchantMemory>('SELECT text_pattern, category_id, hit_count FROM merchant_memory');
}

/**
 * Remember "this note means this category". A new category for a known
 * pattern replaces the old one (the user corrected it).
 */
export async function learnMerchant(db: Db, note: string, categoryId: number): Promise<void> {
  const pattern = merchantPattern(note);
  if (pattern.length < 2) return;
  await db.runAsync(
    `INSERT INTO merchant_memory (text_pattern, category_id, hit_count) VALUES (?, ?, 1)
     ON CONFLICT(text_pattern) DO UPDATE SET
       hit_count = CASE WHEN category_id = excluded.category_id THEN hit_count + 1 ELSE 1 END,
       category_id = excluded.category_id`,
    pattern, categoryId,
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: number;
  /** 'ai' = assistant reply phrased by Gemini; 'assistant' = offline answer. */
  role: 'user' | 'assistant' | 'ai';
  content: string;
  created_at: number;
}

export function listChat(db: Db, limit = 100): Promise<ChatMessage[]> {
  return db.getAllAsync<ChatMessage>(
    'SELECT id, role, content, created_at FROM (SELECT * FROM chat_history ORDER BY id DESC LIMIT ?) ORDER BY id',
    limit,
  );
}

export async function addChat(db: Db, role: ChatMessage['role'], content: string, nowMs = Date.now()): Promise<void> {
  await db.runAsync('INSERT INTO chat_history (role, content, created_at) VALUES (?, ?, ?)', role, content, nowMs);
}

export async function clearChat(db: Db): Promise<void> {
  await db.runAsync('DELETE FROM chat_history');
}

/** Transactions created by confirming recurring items (left out of insights). */
export async function listRecurringTransactionIds(db: Db): Promise<Set<number>> {
  const rows = await db.getAllAsync<{ transaction_id: number }>(
    'SELECT transaction_id FROM pending_recurring WHERE transaction_id IS NOT NULL',
  );
  return new Set(rows.map((r) => r.transaction_id));
}
