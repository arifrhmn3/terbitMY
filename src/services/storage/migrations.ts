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

  // 2: alarm occurrences (each time an alarm rings or is simulated)
  `CREATE TABLE IF NOT EXISTS alarm_occurrences (
    id TEXT PRIMARY KEY NOT NULL,
    alarm_id TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    alarm_label TEXT NOT NULL DEFAULT '',
    mission TEXT NOT NULL,
    snooze_minutes INTEGER,
    started_at INTEGER,
    mission_started_at INTEGER,
    mission_completed_at INTEGER,
    ended_at INTEGER,
    result TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (alarm_id, scheduled_at)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS alarm_occurrences_one_active_per_alarm
    ON alarm_occurrences (alarm_id)
    WHERE status IN ('scheduled', 'started', 'mission_in_progress');
  CREATE INDEX IF NOT EXISTS alarm_occurrences_by_time ON alarm_occurrences (scheduled_at);`,

  // 3: rename status 'started' → 'alarm_fired', and rebuild the
  // one-active-per-alarm index to match.
  `UPDATE alarm_occurrences SET status = 'alarm_fired' WHERE status = 'started';
  DROP INDEX IF EXISTS alarm_occurrences_one_active_per_alarm;
  CREATE UNIQUE INDEX alarm_occurrences_one_active_per_alarm
    ON alarm_occurrences (alarm_id)
    WHERE status IN ('scheduled', 'alarm_fired', 'mission_in_progress');`,

  // 4: accountability modes. Existing alarms become Reward mode (the most
  // permissive; mission optional for stopping). Occurrences copy the mode and
  // record how the alarm was stopped and how we know it fired. Existing
  // occurrences all came from "Simulate alarm now" (evidence 'app').
  `ALTER TABLE alarms ADD COLUMN completion_mode TEXT NOT NULL DEFAULT 'reward';
  ALTER TABLE alarms ADD COLUMN gentle_reminder_minutes INTEGER NOT NULL DEFAULT 10;
  ALTER TABLE alarm_occurrences ADD COLUMN completion_mode TEXT NOT NULL DEFAULT 'reward';
  ALTER TABLE alarm_occurrences ADD COLUMN gentle_reminder_minutes INTEGER NOT NULL DEFAULT 10;
  ALTER TABLE alarm_occurrences ADD COLUMN fire_evidence TEXT NOT NULL DEFAULT 'app';
  ALTER TABLE alarm_occurrences ADD COLUMN alarm_stopped_at INTEGER;
  ALTER TABLE alarm_occurrences ADD COLUMN alarm_stop_reason TEXT;`,
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
