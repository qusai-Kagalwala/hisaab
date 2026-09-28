import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The subset of expo-sqlite the data layer uses. Keeping it narrow lets the
 * tests run the real SQL against Node's built-in SQLite.
 */
export type Db = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'withTransactionAsync'
>;
