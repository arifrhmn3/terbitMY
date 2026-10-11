import type { SQLiteDatabase } from 'expo-sqlite';

/** Small local key-value settings (JSON values), stored in the `app_settings` table. */
export interface SettingsStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

type SettingsDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export function createSqliteSettingsStore(db: SettingsDatabase, now: () => number = Date.now): SettingsStore {
  return {
    async get<T>(key: string) {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
      if (!row) return null;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T) {
      await db.runAsync(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
        key,
        JSON.stringify(value),
        now(),
      );
    },
  };
}

/** In-memory settings for tests and the web preview. */
export function createMemorySettingsStore(): SettingsStore {
  const values = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const raw = values.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T) {
      values.set(key, JSON.stringify(value));
    },
  };
}
