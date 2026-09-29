/**
 * Ledger rules. Transactions are immutable: an edit is a new 'correction' row
 * holding the full replacement values; a deletion is a correction with amount 0.
 * Balances are always computed from rows, never stored.
 */
import { addPaise, assertPaise, subtractPaise, type Paise } from './money';
import type { EffectiveTransaction, TransactionRow } from './types';

/** A transfer row must say where the money went: another account, or a person. */
function checkTransferShape(row: TransactionRow): void {
  const toAccount = row.to_account_id ?? null;
  const debt = row.debt_id ?? null;
  const direction = row.direction ?? null;
  const isAccountTransfer = toAccount != null && debt == null && direction == null;
  const isDebtTransfer = toAccount == null && debt != null && (direction === 'in' || direction === 'out');
  if (!isAccountTransfer && !isDebtTransfer) {
    throw new Error(`Transfer ${row.id} needs either a destination account or a person`);
  }
  if (isAccountTransfer && toAccount === row.account_id) {
    throw new Error(`Transfer ${row.id} goes to the same account`);
  }
}

/**
 * Collapse raw rows into effective transactions. The latest correction
 * (highest id) for each original wins. Voided entries are included with
 * `voided: true` so callers can decide whether to show them.
 */
export function resolveTransactions(rows: readonly TransactionRow[]): EffectiveTransaction[] {
  const originals = new Map<number, TransactionRow>();
  const latestCorrection = new Map<number, TransactionRow>();

  for (const row of rows) {
    assertPaise(row.amount_paise);
    if (row.amount_paise < 0) {
      throw new Error(`Transaction ${row.id} has a negative amount; sign comes from type`);
    }
    if (row.type === 'correction') {
      if (row.corrects_id == null) {
        throw new Error(`Correction ${row.id} does not reference a transaction`);
      }
      const current = latestCorrection.get(row.corrects_id);
      if (!current || row.id > current.id) latestCorrection.set(row.corrects_id, row);
    } else {
      if (row.corrects_id != null) {
        throw new Error(`Transaction ${row.id} is not a correction but has corrects_id`);
      }
      originals.set(row.id, row);
    }
  }

  for (const [originalId, correction] of latestCorrection) {
    const original = originals.get(originalId);
    if (!original) {
      throw new Error(`Correction ${correction.id} references missing transaction ${originalId}`);
    }
    if (original.type === 'transfer') {
      checkTransferShape({ ...correction, debt_id: original.debt_id, direction: original.direction });
    }
  }
  for (const original of originals.values()) {
    if (original.type === 'transfer') checkTransferShape(original);
  }

  const result: EffectiveTransaction[] = [];
  for (const original of originals.values()) {
    const type = original.type as EffectiveTransaction['type'];
    const correction = latestCorrection.get(original.id);
    const source = correction ?? original;
    result.push({
      id: original.id,
      type,
      account_id: source.account_id,
      category_id: source.category_id,
      bucket_id: source.bucket_id,
      amount_paise: source.amount_paise,
      note: source.note,
      occurred_at: original.created_at,
      corrected_by: correction ? correction.id : null,
      voided: source.amount_paise === 0,
      // Who the money moved with never changes; the destination account can.
      to_account_id: type === 'transfer' ? source.to_account_id ?? null : null,
      debt_id: type === 'transfer' ? original.debt_id ?? null : null,
      direction: type === 'transfer' ? original.direction ?? null : null,
    });
  }

  result.sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
  return result;
}

/**
 * Signed effect of one transaction on its own account's balance. A transfer
 * between two accounts touches both — use balanceEffects() for those.
 */
export function signedAmount(
  tx: Pick<EffectiveTransaction, 'type' | 'amount_paise' | 'direction' | 'to_account_id'>,
): Paise {
  switch (tx.type) {
    case 'income':
      return tx.amount_paise;
    case 'expense':
      return -tx.amount_paise;
    case 'transfer':
      if (tx.direction === 'in') return tx.amount_paise;
      if (tx.direction === 'out') return -tx.amount_paise;
      throw new Error('A transfer between accounts changes two balances; use balanceEffects');
  }
}

/** Every balance change a transaction causes, as [account id, signed paise]. */
export function balanceEffects(tx: EffectiveTransaction): [number, Paise][] {
  if (tx.voided) return [];
  if (tx.type === 'transfer' && tx.to_account_id != null) {
    return [
      [tx.account_id, -tx.amount_paise],
      [tx.to_account_id, tx.amount_paise],
    ];
  }
  return [[tx.account_id, signedAmount(tx)]];
}

/** Balance per account id. Accounts with no transactions get 0. */
export function computeBalances(
  accountIds: readonly number[],
  transactions: readonly EffectiveTransaction[],
): Map<number, Paise> {
  const balances = new Map<number, Paise>();
  for (const id of accountIds) balances.set(id, 0);
  for (const tx of transactions) {
    for (const [accountId, delta] of balanceEffects(tx)) {
      balances.set(accountId, addPaise(balances.get(accountId) ?? 0, delta));
    }
  }
  return balances;
}

export interface CorrectionInput {
  account_id: number;
  category_id: number | null;
  amount_paise: Paise;
  note: string | null;
  /** Omit to keep the current bucket. */
  bucket_id?: number | null;
  /** Transfers between accounts only. Omit to keep the current destination. */
  to_account_id?: number | null;
}

export interface CorrectionRow {
  corrects_id: number;
  account_id: number;
  category_id: number | null;
  bucket_id: number | null;
  amount_paise: Paise;
  note: string | null;
  to_account_id: number | null;
  debt_id: number | null;
  direction: EffectiveTransaction['direction'];
}

/**
 * Build the row values for a correction of `current`. Returns null when
 * nothing changed, so no pointless correction rows are written.
 */
export function buildCorrection(current: EffectiveTransaction, next: CorrectionInput): CorrectionRow | null {
  assertPaise(next.amount_paise);
  if (next.amount_paise < 0) throw new Error('Amount cannot be negative');
  const note = next.note?.trim() ? next.note.trim() : null;
  const bucketId = next.bucket_id === undefined ? current.bucket_id : next.bucket_id;
  const currentTo = current.to_account_id ?? null;
  const toAccountId = next.to_account_id === undefined ? currentTo : next.to_account_id;
  if (current.type === 'transfer' && currentTo != null) {
    if (toAccountId == null) throw new Error('A transfer needs a destination account');
    if (toAccountId === next.account_id) throw new Error('Pick two different accounts');
  } else if (toAccountId != null) {
    throw new Error('Only transfers between accounts have a destination account');
  }
  const unchanged =
    currentTo === toAccountId &&
    current.bucket_id === bucketId &&
    current.account_id === next.account_id &&
    current.category_id === next.category_id &&
    current.amount_paise === next.amount_paise &&
    current.note === note;
  if (unchanged) return null;
  return {
    corrects_id: current.id,
    account_id: next.account_id,
    category_id: next.category_id,
    bucket_id: bucketId,
    amount_paise: next.amount_paise,
    note,
    to_account_id: toAccountId,
    debt_id: current.debt_id ?? null,
    direction: current.direction ?? null,
  };
}

/**
 * "What's in this account right now?" → the entry that makes the computed
 * balance match, or null when it already does. Logged under the hidden
 * Balance adjustment category so insights can ignore it.
 */
export function balanceAdjustment(
  currentBalance: Paise,
  actualBalance: Paise,
): { type: 'income' | 'expense'; amount_paise: Paise } | null {
  const diff = subtractPaise(actualBalance, currentBalance);
  if (diff === 0) return null;
  return diff > 0 ? { type: 'income', amount_paise: diff } : { type: 'expense', amount_paise: -diff };
}

// ---------------------------------------------------------------------------
// History grouping
// ---------------------------------------------------------------------------

export interface DayGroup {
  /** Local date key, YYYY-MM-DD. */
  key: string;
  /** Start of the local day, epoch ms. */
  dayStart: number;
  transactions: EffectiveTransaction[];
  /** Sum of expenses that day (positive number). */
  spent: Paise;
}

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Group visible (non-voided) transactions by local day, newest first. */
export function groupByDay(transactions: readonly EffectiveTransaction[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  const sorted = [...transactions]
    .filter((t) => !t.voided)
    .sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
  for (const tx of sorted) {
    const key = localDayKey(tx.occurred_at);
    let group = groups.get(key);
    if (!group) {
      const d = new Date(tx.occurred_at);
      group = {
        key,
        dayStart: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        transactions: [],
        spent: 0,
      };
      groups.set(key, group);
    }
    group.transactions.push(tx);
    if (tx.type === 'expense') group.spent = addPaise(group.spent, tx.amount_paise);
  }
  return [...groups.values()];
}
