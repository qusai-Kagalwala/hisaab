/**
 * Data access for the money model: buckets, recurring rules and pending
 * confirmations. Rules live in src/engine; this file only reads and writes.
 */
import type { AllocationChange, Bucket, BucketRole } from '../engine/buckets';
import type { MonthKey } from '../engine/calendar';
import { assertPaise, type Paise } from '../engine/money';
import {
  collectDue,
  firstDueDate,
  validateAnchor,
  type PendingRecurring,
  type Recurring,
  type RecurringRule,
} from '../engine/recurring';
import type { NewMonthBucket } from '../engine/rollover';
import { addTransaction } from './queries';
import type { Db } from './types';

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

interface BucketRow {
  id: number;
  name: string;
  period_month: string;
  allocated_paise: number;
  role: BucketRole;
  sort_order: number;
  categories_json: string;
}

function toBucket(r: BucketRow): Bucket {
  return {
    id: r.id,
    name: r.name,
    period_month: r.period_month,
    allocated_paise: r.allocated_paise,
    role: r.role ?? null,
    sort_order: r.sort_order,
    category_ids: JSON.parse(r.categories_json) as number[],
  };
}

export async function listAllBuckets(db: Db): Promise<Bucket[]> {
  const rows = await db.getAllAsync<BucketRow>(
    `SELECT id, name, period_month, allocated_paise, role, sort_order, categories_json
     FROM buckets ORDER BY period_month, sort_order, id`,
  );
  return rows.map(toBucket);
}

export interface NewBucket {
  name: string;
  role: BucketRole;
  sort_order: number;
  category_ids: number[];
  allocated_paise: Paise;
}

/** Create a month's buckets in one go (setup from a template, or rollover). */
export async function createBuckets(db: Db, month: MonthKey, buckets: readonly (NewBucket | NewMonthBucket)[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const b of buckets) {
      assertPaise(b.allocated_paise);
      if (b.allocated_paise < 0) throw new Error('Allocation cannot be negative');
      await db.runAsync(
        `INSERT INTO buckets (name, period_month, allocated_paise, role, sort_order, categories_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        b.name.trim(), month, b.allocated_paise, b.role, b.sort_order, JSON.stringify(b.category_ids),
      );
    }
  });
}

export async function setAllocations(db: Db, changes: readonly AllocationChange[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const c of changes) {
      assertPaise(c.allocated_paise);
      if (c.allocated_paise < 0) throw new Error('Allocation cannot be negative');
      await db.runAsync('UPDATE buckets SET allocated_paise = ? WHERE id = ?', c.allocated_paise, c.id);
    }
  });
}

export async function updateBucket(
  db: Db,
  id: number,
  fields: { name: string; category_ids: number[] },
): Promise<void> {
  const name = fields.name.trim();
  if (!name) throw new Error('Bucket name is required');
  await db.withTransactionAsync(async () => {
    const bucket = await db.getFirstAsync<{ period_month: string }>('SELECT period_month FROM buckets WHERE id = ?', id);
    if (!bucket) throw new Error('Bucket not found');
    // A category draws from one bucket per month: take it off the others.
    const siblings = await db.getAllAsync<{ id: number; categories_json: string }>(
      'SELECT id, categories_json FROM buckets WHERE period_month = ? AND id != ?',
      bucket.period_month, id,
    );
    for (const s of siblings) {
      const cats = (JSON.parse(s.categories_json) as number[]).filter((c) => !fields.category_ids.includes(c));
      await db.runAsync('UPDATE buckets SET categories_json = ? WHERE id = ?', JSON.stringify(cats), s.id);
    }
    await db.runAsync(
      'UPDATE buckets SET name = ?, categories_json = ? WHERE id = ?',
      name, JSON.stringify(fields.category_ids), id,
    );
  });
}

/** Delete a bucket that nothing was ever spent from. Returns false otherwise. */
export async function deleteBucketIfUnused(db: Db, id: number): Promise<boolean> {
  const used = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE bucket_id = ?', id);
  if ((used?.n ?? 0) > 0) return false;
  const r = await db.runAsync("DELETE FROM buckets WHERE id = ? AND role IS NULL", id);
  return r.changes === 1;
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

interface RecurringRow extends Omit<Recurring, 'active'> {
  active: number;
}

export async function listRecurring(db: Db): Promise<Recurring[]> {
  const rows = await db.getAllAsync<RecurringRow>(
    `SELECT id, type, name, amount_paise, account_id, category_id, rule, anchor_day, next_due, active
     FROM recurring ORDER BY type DESC, name`,
  );
  return rows.map((r) => ({ ...r, active: r.active === 1 }));
}

export interface RecurringInput {
  type: 'income' | 'expense';
  name: string;
  amount_paise: Paise;
  account_id: number;
  category_id: number | null;
  rule: RecurringRule;
  anchor_day: number;
}

function validateRecurring(r: RecurringInput): void {
  assertPaise(r.amount_paise);
  if (r.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  if (!r.name.trim()) throw new Error('Name is required');
  validateAnchor(r.rule, r.anchor_day);
}

export async function addRecurring(db: Db, r: RecurringInput, nowMs = Date.now()): Promise<number> {
  validateRecurring(r);
  const result = await db.runAsync(
    `INSERT INTO recurring (type, name, amount_paise, account_id, category_id, rule, anchor_day, next_due, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    r.type, r.name.trim(), r.amount_paise, r.account_id, r.category_id, r.rule, r.anchor_day,
    firstDueDate(r.rule, r.anchor_day, nowMs),
  );
  return result.lastInsertRowId;
}

/** Edit a rule. Changing when it repeats restarts it from the next matching day. */
export async function updateRecurring(db: Db, id: number, r: RecurringInput, nowMs = Date.now()): Promise<void> {
  validateRecurring(r);
  const current = await db.getFirstAsync<{ rule: string; anchor_day: number }>(
    'SELECT rule, anchor_day FROM recurring WHERE id = ?', id,
  );
  if (!current) throw new Error('Recurring item not found');
  const scheduleChanged = current.rule !== r.rule || current.anchor_day !== r.anchor_day;
  await db.runAsync(
    `UPDATE recurring SET type = ?, name = ?, amount_paise = ?, account_id = ?, category_id = ?, rule = ?, anchor_day = ?
     ${scheduleChanged ? ', next_due = ?' : ''} WHERE id = ?`,
    ...[r.type, r.name.trim(), r.amount_paise, r.account_id, r.category_id, r.rule, r.anchor_day],
    ...(scheduleChanged ? [firstDueDate(r.rule, r.anchor_day, nowMs)] : []),
    id,
  );
}

/** Pause or resume. Resuming starts again from the next due day, no back-fill. */
export async function setRecurringActive(db: Db, id: number, active: boolean, nowMs = Date.now()): Promise<void> {
  const r = await db.getFirstAsync<{ rule: RecurringRule; anchor_day: number }>(
    'SELECT rule, anchor_day FROM recurring WHERE id = ?', id,
  );
  if (!r) throw new Error('Recurring item not found');
  if (active) {
    await db.runAsync('UPDATE recurring SET active = 1, next_due = ? WHERE id = ?',
      firstDueDate(r.rule, r.anchor_day, nowMs), id);
  } else {
    await db.runAsync('UPDATE recurring SET active = 0 WHERE id = ?', id);
  }
}

/**
 * Turn due occurrences into pending confirmations and advance next_due.
 * Idempotent: running it twice on the same day adds nothing.
 */
export async function generatePending(db: Db, nowMs = Date.now()): Promise<number> {
  const rules = await listRecurring(db);
  let added = 0;
  await db.withTransactionAsync(async () => {
    for (const r of rules) {
      const { dueDates, nextDue } = collectDue(r, nowMs);
      if (dueDates.length === 0) continue;
      for (const due of dueDates) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO pending_recurring (recurring_id, due_date, status) VALUES (?, ?, 'pending')`,
          r.id, due,
        );
        added += res.changes;
      }
      await db.runAsync('UPDATE recurring SET next_due = ? WHERE id = ?', nextDue, r.id);
    }
  });
  return added;
}

export interface PendingItem extends PendingRecurring {
  name: string;
  type: 'income' | 'expense';
  amount_paise: Paise;
  account_id: number;
  category_id: number | null;
}

export function listPending(db: Db): Promise<PendingItem[]> {
  return db.getAllAsync<PendingItem>(
    `SELECT p.id, p.recurring_id, p.due_date, p.status, p.transaction_id,
            r.name, r.type, r.amount_paise, r.account_id, r.category_id
     FROM pending_recurring p JOIN recurring r ON r.id = p.recurring_id
     WHERE p.status = 'pending'
     ORDER BY p.due_date, p.id`,
  );
}

/**
 * The user tapped Confirm: log the real transaction (dated now, when the
 * money actually moved) with the confirmed amount. Recurring entries are
 * fixed commitments, so they are not drawn from any bucket.
 */
export async function confirmPending(db: Db, item: PendingItem, amount: Paise, nowMs = Date.now()): Promise<number> {
  let txId = 0;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ status: string }>('SELECT status FROM pending_recurring WHERE id = ?', item.id);
    if (row?.status !== 'pending') throw new Error('Already handled');
    txId = await addTransaction(db, {
      type: item.type,
      account_id: item.account_id,
      category_id: item.category_id,
      amount_paise: amount,
      note: item.name,
      created_at: nowMs,
    });
    await db.runAsync(
      "UPDATE pending_recurring SET status = 'confirmed', transaction_id = ? WHERE id = ?",
      txId, item.id,
    );
  });
  return txId;
}

export async function skipPending(db: Db, id: number): Promise<void> {
  await db.runAsync("UPDATE pending_recurring SET status = 'skipped' WHERE id = ? AND status = 'pending'", id);
}

/**
 * Undo (5s window) a confirm or skip: the card comes back. A confirmed
 * transaction is removed only if it was never edited.
 */
export async function reopenPending(db: Db, id: number): Promise<boolean> {
  let ok = false;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ transaction_id: number | null }>(
      'SELECT transaction_id FROM pending_recurring WHERE id = ?', id,
    );
    if (!row) return;
    if (row.transaction_id != null) {
      const corrected = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM transactions WHERE corrects_id = ?', row.transaction_id,
      );
      if ((corrected?.n ?? 0) > 0) return;
      await db.runAsync(
        "UPDATE pending_recurring SET status = 'pending', transaction_id = NULL WHERE id = ?", id,
      );
      await db.runAsync('DELETE FROM transactions WHERE id = ?', row.transaction_id);
    } else {
      await db.runAsync("UPDATE pending_recurring SET status = 'pending' WHERE id = ?", id);
    }
    ok = true;
  });
  return ok;
}
