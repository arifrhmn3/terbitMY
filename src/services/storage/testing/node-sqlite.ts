import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * TEST ONLY. Wraps Node's built-in SQLite in the small part of the
 * expo-sqlite API the app uses, so unit tests can run the real migrations
 * and SQL. Never imported by app code.
 */
export function openTestDatabase(): SQLiteDatabase {
  const db = new DatabaseSync(':memory:');
  const params = (values: unknown[]) => values as SQLInputValue[];

  const adapter = {
    async execAsync(source: string) {
      db.exec(source);
    },
    async runAsync(source: string, ...values: unknown[]) {
      const { changes, lastInsertRowid } = db.prepare(source).run(...params(values));
      return { changes: Number(changes), lastInsertRowId: Number(lastInsertRowid) };
    },
    async getFirstAsync(source: string, ...values: unknown[]) {
      return db.prepare(source).get(...params(values)) ?? null;
    },
    async getAllAsync(source: string, ...values: unknown[]) {
      return db.prepare(source).all(...params(values));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return adapter as unknown as SQLiteDatabase;
}
