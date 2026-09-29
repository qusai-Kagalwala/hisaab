/**
 * Keeps the resolved ledger between loads. Transactions are append-only, so
 * after a save only rows with a higher id are read and folded in. Anything
 * else (an undo removed a row, a backup was restored) is detected by a cheap
 * fingerprint — row count, highest id and amount total — and falls back to a
 * full read.
 */
import { extendLedger, indexLedger, resolveTransactions, type LedgerIndex } from '../engine/ledger';
import type { TransactionRow } from '../engine/types';
import type { Db } from './types';

interface Fingerprint {
  n: number;
  max_id: number;
  total: number;
}

interface Entry extends Fingerprint {
  index: LedgerIndex;
}

const cache = new WeakMap<Db, Entry>();

const COLUMNS = `id, account_id, category_id, bucket_id, amount_paise, type, note, created_at, corrects_id,
                 to_account_id, debt_id, direction`;

/** Forget the cached ledger (e.g. after replacing everything from a backup). */
export function invalidateLedgerCache(db: Db): void {
  cache.delete(db);
}

/**
 * The resolved ledger. With `verify` (development builds), a cached result is
 * cross-checked against a full read; any difference is logged and the full
 * result is used.
 */
export async function loadLedger(db: Db, verify = false): Promise<LedgerIndex> {
  const index = await loadCached(db);
  if (!verify || !cache.has(db)) return index;
  const rows = await db.getAllAsync<TransactionRow>(`SELECT ${COLUMNS} FROM transactions ORDER BY id`);
  if (JSON.stringify(resolveTransactions(rows)) === JSON.stringify(index.list)) return index;
  console.error('Hisaab: cached ledger differed from a full read — rebuilt it.');
  const rebuilt = indexLedger(rows);
  const entry = cache.get(db)!;
  cache.set(db, { ...entry, index: rebuilt });
  return rebuilt;
}

async function loadCached(db: Db): Promise<LedgerIndex> {
  const fp = (await db.getFirstAsync<Fingerprint>(
    'SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS max_id, COALESCE(SUM(amount_paise), 0) AS total FROM transactions',
  )) ?? { n: 0, max_id: 0, total: 0 };
  const prev = cache.get(db);
  if (prev && prev.n === fp.n && prev.max_id === fp.max_id && prev.total === fp.total) return prev.index;

  if (prev && fp.max_id >= prev.max_id) {
    const fresh = await db.getAllAsync<TransactionRow>(
      `SELECT ${COLUMNS} FROM transactions WHERE id > ? ORDER BY id`, prev.max_id,
    );
    const addedTotal = fresh.reduce((sum, r) => sum + r.amount_paise, 0);
    // Only additions since last time? Then extend; otherwise rebuild.
    if (prev.n + fresh.length === fp.n && prev.total + addedTotal === fp.total) {
      const index = extendLedger(prev.index, fresh);
      cache.set(db, { ...fp, index });
      return index;
    }
  }
  const rows = await db.getAllAsync<TransactionRow>(`SELECT ${COLUMNS} FROM transactions ORDER BY id`);
  const index = indexLedger(rows);
  cache.set(db, { ...fp, index });
  return index;
}
