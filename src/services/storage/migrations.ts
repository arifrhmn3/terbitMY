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

  // 5: alarm sound per alarm (catalog decides basic/premium), and a small
  // key-value table for local app settings such as the mock entitlement.
  `ALTER TABLE alarms ADD COLUMN sound_id TEXT NOT NULL DEFAULT 'system-default';
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,

  // 6: progression (Phase 2A). An append-only XP ledger and unlocked
  // achievements. Each award has a unique key (e.g. 'occ:<id>:mission'), so
  // the same morning can never earn XP twice. Alarms and occurrences are
  // untouched; streaks and summaries are derived from occurrences.
  `CREATE TABLE IF NOT EXISTS xp_ledger (
    award_key TEXT PRIMARY KEY NOT NULL,
    occurrence_id TEXT,
    category TEXT,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS xp_ledger_earned_at ON xp_ledger (earned_at);
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY NOT NULL,
    unlocked_at INTEGER NOT NULL,
    occurrence_id TEXT,
    created_at INTEGER NOT NULL
  );`,

  // 7: morning accountability. Each occurrence records whether it was the
  // Main Wake-Up Alarm when it fired; only those count as "mornings". Older
  // rows didn't record it, so they're filled in ONCE from the alarm's main
  // setting at upgrade time (deleted alarms: not main), then frozen. The
  // developer seed's example mornings ('dev-seed', no alarm row) are mornings.
  `ALTER TABLE alarm_occurrences ADD COLUMN is_main_wake_up INTEGER NOT NULL DEFAULT 0;
  UPDATE alarm_occurrences
     SET is_main_wake_up = CASE
       WHEN alarm_id = 'dev-seed' THEN 1
       ELSE COALESCE((SELECT is_primary FROM alarms WHERE alarms.id = alarm_occurrences.alarm_id), 0)
     END;`,

  // 8: cloud sync (Phase 2B). What has already been backed up, per account:
  // a fingerprint of each record's content when it was last sent. A record
  // is "pending" when it has no row here or its content changed since. Local
  // records themselves are untouched and have no account attached, so signing
  // out never deletes anything.
  `CREATE TABLE IF NOT EXISTS sync_state (
    user_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, entity, entity_id)
  );`,
  // 9: faith content cache (Phase 3C). Recitation passages fetched ahead of
  // time (today, tomorrow) or opened from the archive, stored exactly as the
  // source provided them, with a checksum so altered text is never shown.
  `CREATE TABLE IF NOT EXISTS faith_content_cache (
    provider TEXT NOT NULL,
    content_id TEXT NOT NULL,
    body TEXT NOT NULL,
    checksum TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (provider, content_id)
  );`,

  // 10: snooze is one alarm with a limit (Phase 3.5): how many extra rings
  // snoozing allows. Existing alarms get the default (3).
  `ALTER TABLE alarms ADD COLUMN snooze_max INTEGER NOT NULL DEFAULT 3;`,

  // 11: native snooze (Phase 3.5). How many times a morning's alarm was snoozed;
  // snooze rings belong to that one morning.
  `ALTER TABLE alarm_occurrences ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0;`,
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
