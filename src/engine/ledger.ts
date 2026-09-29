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

function checkRow(row: TransactionRow): void {
  assertPaise(row.amount_paise);
  if (row.amount_paise < 0) {
    throw new Error(`Transaction ${row.id} has a negative amount; sign comes from type`);
  }
  if (row.type === 'correction') {
    if (row.corrects_id == null) throw new Error(`Correction ${row.id} does not reference a transaction`);
  } else if (row.corrects_id != null) {
    throw new Error(`Transaction ${row.id} is not a correction but has corrects_id`);
  }
}

/** The current view of `original` after its latest `correction` (if any). */
function effectiveOf(original: TransactionRow, correction: TransactionRow | undefined): EffectiveTransaction {
  const type = original.type as EffectiveTransaction['type'];
  if (type === 'transfer') {
    checkTransferShape(original);
    if (correction) checkTransferShape({ ...correction, debt_id: original.debt_id, direction: original.direction });
  }
  const source = correction ?? original;
  return {
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
  };
}

/** Newest first; ties by id. */
function byNewest(a: EffectiveTransaction, b: EffectiveTransaction): number {
  return b.occurred_at - a.occurred_at || b.id - a.id;
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
    checkRow(row);
    if (row.type === 'correction') {
      const current = latestCorrection.get(row.corrects_id!);
      if (!current || row.id > current.id) latestCorrection.set(row.corrects_id!, row);
    } else {
      originals.set(row.id, row);
    }
  }

  for (const [originalId, correction] of latestCorrection) {
    if (!originals.has(originalId)) {
      throw new Error(`Correction ${correction.id} references missing transaction ${originalId}`);
    }
  }

  const result: EffectiveTransaction[] = [];
  for (const original of originals.values()) result.push(effectiveOf(original, latestCorrection.get(original.id)));
  result.sort(byNewest);
  return result;
}

/**
 * A resolved ledger that can grow cheaply. Rows are append-only, so after a
 * save only the new rows need work (see extendLedger). Same result as
 * resolveTransactions over all rows — tested.
 */
export interface LedgerIndex {
  /** Newest first, like resolveTransactions. */
  list: EffectiveTransaction[];
  originals: Map<number, TransactionRow>;
  corrections: Map<number, TransactionRow>;
}

export function indexLedger(rows: readonly TransactionRow[]): LedgerIndex {
  const index: LedgerIndex = { list: [], originals: new Map(), corrections: new Map() };
  return extendLedger(index, rows);
}

/** Add rows with ids above every row already indexed. Returns a new index; `prev` is not changed. */
export function extendLedger(prev: LedgerIndex, newRows: readonly TransactionRow[]): LedgerIndex {
  if (newRows.length === 0) return prev;
  const originals = new Map(prev.originals);
  const corrections = new Map(prev.corrections);
  const touched = new Set<number>();
  const added: number[] = [];
  for (const row of [...newRows].sort((a, b) => a.id - b.id)) {
    checkRow(row);
    if (row.type === 'correction') {
      const current = corrections.get(row.corrects_id!);
      if (!current || row.id > current.id) corrections.set(row.corrects_id!, row);
      touched.add(row.corrects_id!);
    } else {
      originals.set(row.id, row);
      added.push(row.id);
    }
  }
  for (const id of touched) {
    if (!originals.has(id)) throw new Error(`Correction ${corrections.get(id)!.id} references missing transaction ${id}`);
  }
  const list = prev.list.map((t) => (touched.has(t.id) ? effectiveOf(originals.get(t.id)!, corrections.get(t.id)) : t));
  const fresh = added.map((id) => effectiveOf(originals.get(id)!, corrections.get(id))).sort(byNewest);
  // Merge the new entries (usually "now", so at the front) into the sorted list.
  const merged: EffectiveTransaction[] = [];
  let i = 0;
  let j = 0;
  while (i < list.length || j < fresh.length) {
    if (j >= fresh.length || (i < list.length && byNewest(list[i], fresh[j]) <= 0)) merged.push(list[i++]);
    else merged.push(fresh[j++]);
  }
  return { list: merged, originals, corrections };
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
  // Plain integer sums (every amount is already checked paise), checked once at the end.
  const balances = new Map<number, Paise>();
  for (const id of accountIds) balances.set(id, 0);
  for (const tx of transactions) {
    if (tx.voided) continue;
    if (tx.type === 'transfer' && tx.to_account_id != null) {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) - tx.amount_paise);
      balances.set(tx.to_account_id, (balances.get(tx.to_account_id) ?? 0) + tx.amount_paise);
    } else {
      balances.set(tx.account_id, (balances.get(tx.account_id) ?? 0) + signedAmount(tx));
    }
  }
  for (const v of balances.values()) assertPaise(v, 'balance');
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
