import type { Paise } from './money';

export type AccountType = 'cash' | 'upi_bank' | 'other';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'correction';
export type CategoryKind = 'expense' | 'income';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  created_at: number;
  /** Removed by the user: hidden from pickers, kept because past entries point at it. */
  archived?: boolean;
}

/**
 * Transfers move money without it being spending or income:
 *  - between two of your accounts: `to_account_id` is set;
 *  - with a person (borrow & lend): `debt_id` + `direction` are set —
 *    'in' = money came into `account_id`, 'out' = money left it.
 */
export type TransferDirection = 'in' | 'out';

export interface Category {
  id: number;
  name: string;
  icon: string;
  kind: CategoryKind;
  keywords: string[];
  is_default: boolean;
  /** Hidden from pickers (e.g. Balance update). */
  hidden: boolean;
}

/**
 * A raw row from the transactions table. Rows are never updated.
 * A row with type 'correction' replaces the values of the transaction whose
 * id is in `corrects_id` (always the original, never another correction).
 * `created_at` is epoch milliseconds.
 */
export interface TransactionRow {
  id: number;
  account_id: number;
  category_id: number | null;
  bucket_id: number | null;
  amount_paise: Paise;
  type: TransactionType;
  note: string | null;
  created_at: number;
  corrects_id: number | null;
  /** Transfers only; see TransferDirection. A correction may change to_account_id. */
  to_account_id?: number | null;
  debt_id?: number | null;
  direction?: TransferDirection | null;
}

/** The current view of a transaction after applying its latest correction. */
export interface EffectiveTransaction {
  /** Id of the original row; stable across corrections. */
  id: number;
  type: Exclude<TransactionType, 'correction'>;
  account_id: number;
  category_id: number | null;
  bucket_id: number | null;
  amount_paise: Paise;
  note: string | null;
  /** When the money moved — the original row's created_at. */
  occurred_at: number;
  /** Id of the latest correction applied, or null if never edited. */
  corrected_by: number | null;
  /** True when the latest correction set the amount to 0 (a deletion). */
  voided: boolean;
  /** Transfers only (see TransferDirection); null otherwise. */
  to_account_id?: number | null;
  debt_id?: number | null;
  direction?: TransferDirection | null;
}
