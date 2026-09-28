/// <reference types="node" />
/**
 * Test-only adapter: implements the Db subset over Node's built-in SQLite so
 * migrations and queries run real SQL in Jest.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../types';

type Param = string | number | null;

function flatten(params: unknown[]): Param[] {
  const values = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values as Param[];
}

export function createTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    async execAsync(source: string) {
      sqlite.exec(source);
    },
    async runAsync(source: string, ...params: unknown[]) {
      const r = sqlite.prepare(source).run(...flatten(params));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getAllAsync(source: string, ...params: unknown[]) {
      return sqlite.prepare(source).all(...flatten(params));
    },
    async getFirstAsync(source: string, ...params: unknown[]) {
      return sqlite.prepare(source).get(...flatten(params)) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db as unknown as Db;
}
