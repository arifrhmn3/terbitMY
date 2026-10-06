/**
 * Database schema changes, applied in order. Never edit or reorder a
 * migration that has shipped; add a new one to the end instead.
 * The applied count is stored in SQLite's `PRAGMA user_version`.
 */
export const migrations: readonly string[] = [
  // 1: alarms (Phase 1)
  `CREATE TABLE IF NOT EXISTS alarms (
    id TEXT PRIMARY KEY NOT NULL,
    hour INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    weekdays TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    mission TEXT NOT NULL,
    snooze_enabled INTEGER NOT NULL,
    snooze_minutes INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];

/** The parts of an expo-sqlite database that migrations need. */
export type MigratableDatabase = {
  getFirstAsync<T>(source: string): Promise<T | null>;
  execAsync(source: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

/** Runs any migrations the database hasn't seen yet. Returns how many ran. */
export async function migrate(db: MigratableDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const pending = migrations.slice(current);

  for (const [i, sql] of pending.entries()) {
    const version = current + i + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${version}`);
    });
  }

  return pending.length;
}
