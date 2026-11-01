/**
 * Spotlight account and Savings. Pure.
 *
 * Spotlight: the one account the user spends from day to day. When chosen,
 * every calculation (safe to spend, bills, insights, widgets) looks at that
 * account only; other accounts are still tracked, just not counted.
 * `null` means "all accounts" — the behaviour before spotlight existed.
 *
 * Savings: money handed over (e.g. to family). It leaves an account through
 * a Savings transfer and then belongs to no account, so it is never part of
 * any balance or of safe to spend.
 */
import { addPaise, subtractPaise, type Paise } from './money';
import { monthKey, type MonthKey } from './calendar';
import type { Account, EffectiveTransaction } from './types';

/** Spotlight account id, or null for "all accounts". */
export type Scope = number | null;

/** A transfer into (direction 'out' of the account) or back from Savings. */
export function isSavingsTransfer(
  tx: Pick<EffectiveTransaction, 'type' | 'to_account_id' | 'debt_id' | 'direction'>,
): boolean {
  return tx.type === 'transfer' && tx.to_account_id == null && tx.debt_id == null && tx.direction != null;
}

/** The stored setting → an account still in use, or null (all accounts). */
export function resolveSpotlight(raw: string | null | undefined, accounts: readonly Pick<Account, 'id' | 'archived'>[]): Scope {
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  return accounts.some((a) => a.id === id && !a.archived) ? id : null;
}

/** Does this entry touch the spotlight account? Everything counts when there is no spotlight. */
export function inScope(tx: Pick<EffectiveTransaction, 'account_id' | 'to_account_id'>, scope: Scope): boolean {
  return scope == null || tx.account_id === scope || tx.to_account_id === scope;
}

/** Entries that touch the spotlight account (same order). */
export function scopeTransactions<T extends Pick<EffectiveTransaction, 'account_id' | 'to_account_id'>>(
  transactions: readonly T[],
  scope: Scope,
): T[] {
  return scope == null ? [...transactions] : transactions.filter((t) => inScope(t, scope));
}

/** Balances counted for daily spending: the spotlight account only, or all. */
export function scopeBalances(balances: ReadonlyMap<number, Paise>, scope: Scope): Map<number, Paise> {
  if (scope == null) return new Map(balances);
  return new Map([[scope, balances.get(scope) ?? 0]]);
}

/** Bills, income and their pending cards that use the spotlight account. */
export function scopeByAccount<T extends { account_id: number }>(items: readonly T[], scope: Scope): T[] {
  return scope == null ? [...items] : items.filter((i) => i.account_id === scope);
}

/** Savings held through Savings transfers: put in minus taken back. */
export function savingsFromTransfers(transactions: readonly EffectiveTransaction[]): Paise {
  let total: Paise = 0;
  for (const t of transactions) {
    if (t.voided || !isSavingsTransfer(t)) continue;
    total = t.direction === 'out' ? addPaise(total, t.amount_paise) : subtractPaise(total, t.amount_paise);
  }
  return total;
}

export interface MonthMoves {
  /** Moved into the spotlight account from your other accounts. */
  moved_in_paise: Paise;
  /** Moved out of the spotlight account to your other accounts. */
  moved_out_paise: Paise;
  /** Put into Savings (net of anything taken back) from the counted accounts. */
  to_savings_paise: Paise;
}

/**
 * Money that moved but was neither income nor spending, for Insights.
 * With no spotlight, moves between your own accounts cancel out, so only
 * Savings is reported.
 */
export function monthMoves(transactions: readonly EffectiveTransaction[], scope: Scope, month: MonthKey): MonthMoves {
  const out: MonthMoves = { moved_in_paise: 0, moved_out_paise: 0, to_savings_paise: 0 };
  for (const t of transactions) {
    if (t.voided || t.type !== 'transfer' || monthKey(t.occurred_at) !== month || !inScope(t, scope)) continue;
    if (isSavingsTransfer(t)) {
      out.to_savings_paise =
        t.direction === 'out' ? addPaise(out.to_savings_paise, t.amount_paise) : subtractPaise(out.to_savings_paise, t.amount_paise);
    } else if (scope != null && t.to_account_id != null) {
      if (t.to_account_id === scope) out.moved_in_paise = addPaise(out.moved_in_paise, t.amount_paise);
      else out.moved_out_paise = addPaise(out.moved_out_paise, t.amount_paise);
    }
  }
  return out;
}

/** Can `amount` be taken back from Savings without going below zero? */
export function canTakeFromSavings(savings: Paise, amount: Paise): boolean {
  return amount > 0 && amount <= savings;
}
