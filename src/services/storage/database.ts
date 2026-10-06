import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrations';

const DATABASE_NAME = 'terbit.db';

let opening: Promise<SQLiteDatabase> | null = null;

async function open() {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
  return db;
}

/**
 * The app's on-device SQLite database, opened once and migrated to the latest
 * schema. Data stays on the phone and works offline.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  opening ??= open().catch((error: unknown) => {
    opening = null; // allow a retry on the next call
    throw error;
  });
  return opening;
}
