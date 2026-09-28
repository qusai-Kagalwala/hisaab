/**
 * Ledger rules. Transactions are immutable: an edit is a new 'correction' row
 * holding the full replacement values; a deletion is a correction with amount 0.
 * Balances are always computed from rows, never stored.
 */
import { addPaise, assertPaise, subtractPaise, type Paise } from './money';
import type { EffectiveTransaction, TransactionRow } from './types';

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
    if (!originals.has(originalId)) {
      throw new Error(`Correction ${correction.id} references missing transaction ${originalId}`);
    }
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
    });
  }

  result.sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
  return result;
}

/** Signed effect of one transaction on its account's balance. */
export function signedAmount(tx: Pick<EffectiveTransaction, 'type' | 'amount_paise'>): Paise {
  switch (tx.type) {
    case 'income':
      return tx.amount_paise;
    case 'expense':
      return -tx.amount_paise;
    case 'transfer':
      // Transfers need a destination account, which arrives with the money model.
      throw new Error('Transfers are not supported yet');
  }
}

/** Balance per account id. Accounts with no transactions get 0. */
export function computeBalances(
  accountIds: readonly number[],
  transactions: readonly EffectiveTransaction[],
): Map<number, Paise> {
  const balances = new Map<number, Paise>();
  for (const id of accountIds) balances.set(id, 0);
  for (const tx of transactions) {
    if (tx.voided) continue;
    const current = balances.get(tx.account_id) ?? 0;
    balances.set(tx.account_id, addPaise(current, signedAmount(tx)));
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
}

/**
 * Build the row values for a correction of `current`. Returns null when
 * nothing changed, so no pointless correction rows are written.
 */
export function buildCorrection(
  current: EffectiveTransaction,
  next: CorrectionInput,
): (Omit<CorrectionInput, 'bucket_id'> & { corrects_id: number; bucket_id: number | null }) | null {
  assertPaise(next.amount_paise);
  if (next.amount_paise < 0) throw new Error('Amount cannot be negative');
  const note = next.note?.trim() ? next.note.trim() : null;
  const bucketId = next.bucket_id === undefined ? current.bucket_id : next.bucket_id;
  const unchanged =
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
