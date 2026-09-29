/**
 * Borrow & lend data access. A debt row holds who and the repayment plan;
 * every rupee that moves is a 'transfer' row in the ledger (see
 * src/engine/debts.ts), so balances and what's owed are always computed.
 */
import {
  principalDirection,
  settleDirection,
  validatePlan,
  type Debt,
  type DebtKind,
  type RepaymentPlan,
} from '../engine/debts';
import { assertPaise, type Paise } from '../engine/money';
import { addTransfer } from './queries';
import type { Db } from './types';

export function listDebts(db: Db): Promise<Debt[]> {
  return db.getAllAsync<Debt>(
    'SELECT id, person, kind, months, per_month_paise, first_due, created_at FROM debts ORDER BY id',
  );
}

export interface NewDebt {
  person: string;
  kind: DebtKind;
  amount_paise: Paise;
  account_id: number;
  plan: RepaymentPlan;
  /** Required when there is a plan. */
  first_due: number | null;
  note?: string | null;
  created_at?: number;
}

/** Record borrowing or lending: the debt and the money moving, together. */
export async function addDebt(db: Db, d: NewDebt): Promise<{ debtId: number; txId: number }> {
  const person = d.person.trim();
  if (!person) throw new Error('Who was it with?');
  assertPaise(d.amount_paise);
  if (d.amount_paise <= 0) throw new Error('Amount must be greater than zero');
  const plan = d.kind === 'borrowed' ? d.plan : {};
  validatePlan(d.amount_paise, plan);
  const hasPlan = plan.months != null || plan.per_month_paise != null;
  if (hasPlan && d.first_due == null) throw new Error('Pick when the first payment is due');
  const now = d.created_at ?? Date.now();
  let debtId = 0;
  let txId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'INSERT INTO debts (person, kind, months, per_month_paise, first_due, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      person.slice(0, 40), d.kind, plan.months ?? null, plan.per_month_paise ?? null, hasPlan ? d.first_due : null, now,
    );
    debtId = res.lastInsertRowId;
    txId = await addTransfer(db, {
      account_id: d.account_id,
      amount_paise: d.amount_paise,
      debt_id: debtId,
      direction: principalDirection(d.kind),
      note: d.note,
      created_at: now,
    });
  });
  return { debtId, txId };
}

/** Change the repayment plan (not the money): e.g. 3 months → 6 months. */
export async function updateDebtPlan(
  db: Db,
  debtId: number,
  total: Paise,
  plan: RepaymentPlan,
  firstDue: number | null,
): Promise<void> {
  validatePlan(total, plan);
  const hasPlan = plan.months != null || plan.per_month_paise != null;
  if (hasPlan && firstDue == null) throw new Error('Pick when the first payment is due');
  await db.runAsync(
    'UPDATE debts SET months = ?, per_month_paise = ?, first_due = ? WHERE id = ?',
    plan.months ?? null, plan.per_month_paise ?? null, hasPlan ? firstDue : null, debtId,
  );
}

export async function renameDebtPerson(db: Db, debtId: number, person: string): Promise<void> {
  const name = person.trim();
  if (!name) throw new Error('Who was it with?');
  await db.runAsync('UPDATE debts SET person = ? WHERE id = ?', name.slice(0, 40), debtId);
}

/** A repayment (borrowed) or money got back (lent). The user always confirms it. */
export function addDebtPayment(
  db: Db,
  debt: Pick<Debt, 'id' | 'kind'>,
  amount: Paise,
  accountId: number,
  note?: string | null,
): Promise<number> {
  return addTransfer(db, {
    account_id: accountId,
    amount_paise: amount,
    debt_id: debt.id,
    direction: settleDirection(debt.kind),
    note,
  });
}

/**
 * Undo (5s window) a just-recorded debt: removes its first entry and the
 * debt itself, only if nothing else was recorded against it since.
 */
export async function undoNewDebt(db: Db, debtId: number): Promise<boolean> {
  let ok = false;
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM transactions WHERE debt_id = ?', debtId);
    if (rows.length !== 1) return;
    await db.runAsync('DELETE FROM transactions WHERE id = ?', rows[0].id);
    await db.runAsync('DELETE FROM debts WHERE id = ?', debtId);
    ok = true;
  });
  return ok;
}

// ---------------------------------------------------------------------------
// Removing accounts
// ---------------------------------------------------------------------------

/** Point active bills/income at another account; returns what changed, for undo. */
export async function moveRecurringToAccount(db: Db, fromId: number, toId: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM recurring WHERE account_id = ?', fromId);
  await db.runAsync('UPDATE recurring SET account_id = ? WHERE account_id = ?', toId, fromId);
  return rows.map((r) => r.id);
}

export async function setRecurringAccount(db: Db, ids: readonly number[], accountId: number): Promise<void> {
  for (const id of ids) await db.runAsync('UPDATE recurring SET account_id = ? WHERE id = ?', accountId, id);
}
