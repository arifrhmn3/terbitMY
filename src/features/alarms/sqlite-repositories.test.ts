/**
 * Runs the real migrations and repository SQL against SQLite (Node's
 * built-in copy), so the on-phone database code is tested too.
 */
import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { createSqliteAlarmRepository } from './alarm-repository';
import { createOccurrence, dismissOccurrence, markAlarmFired, type AlarmOccurrence } from './occurrence';
import { createOccurrenceManager } from './occurrence-manager';
import { createSqliteOccurrenceRepository, DuplicateOccurrenceError } from './occurrence-repository';
import { migrate, migrations } from '@/services/storage/migrations';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

async function database() {
  const db = openTestDatabase();
  await migrate(db);
  return db;
}

const alarm: Alarm = {
  ...createAlarmDraft({ label: 'Subuh', isPrimary: true }),
  id: 'alarm-1',
  createdAt: 1,
  updatedAt: 1,
};

function occurrence(id: string, scheduledAt: number, alarmId = 'alarm-1'): AlarmOccurrence {
  return createOccurrence({ alarm: { ...alarm, id: alarmId }, scheduledAt, source: 'simulated', now: scheduledAt, id });
}

describe('SQLite migrations', () => {
  it('migrate sets user_version and is safe to run twice', async () => {
    const db = await database();
    expect(await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')).toEqual({
      user_version: migrations.length,
    });
    expect(await migrate(db)).toBe(0);
  });

  it("migration 3 turns old 'started' rows into alarm_fired and keeps one active per alarm", async () => {
    // A database as phones had it before migration 3.
    const db = openTestDatabase();
    for (const [i, sql] of migrations.slice(0, 2).entries()) {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${i + 1}`);
    }
    const legacy = { ...occurrence('old-active', 100), status: 'started' };
    await db.runAsync(
      `INSERT INTO alarm_occurrences (id, alarm_id, scheduled_at, source, status, alarm_label, mission, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      legacy.id,
      legacy.alarmId,
      legacy.scheduledAt,
      legacy.source,
      legacy.status,
      legacy.alarmLabel,
      JSON.stringify(legacy.mission),
      legacy.createdAt,
      legacy.updatedAt,
    );

    expect(await migrate(db)).toBe(migrations.length - 2);
    expect(await db.getFirstAsync('SELECT status FROM alarm_occurrences WHERE id = ?', 'old-active')).toEqual({
      status: 'alarm_fired',
    });
    // The rebuilt index still blocks a second active occurrence for the same alarm.
    const repo = createSqliteOccurrenceRepository(db);
    await expect(repo.insert(occurrence('new', 200))).rejects.toBeInstanceOf(DuplicateOccurrenceError);
  });
});

describe('SQLite alarm repository', () => {
  it('saves, updates, lists and removes alarms', async () => {
    const repo = createSqliteAlarmRepository(await database());
    await repo.save(alarm);
    await repo.save({ ...alarm, id: 'alarm-2', hour: 5, isPrimary: false });
    await repo.save({ ...alarm, label: 'Updated' });

    const list = await repo.list();
    expect(list.map((a) => a.id)).toEqual(['alarm-2', 'alarm-1']);
    expect(list[1]).toEqual({ ...alarm, label: 'Updated' });

    await repo.remove('alarm-2');
    expect((await repo.list()).map((a) => a.id)).toEqual(['alarm-1']);
  });

  it('keeps only one primary alarm', async () => {
    const repo = createSqliteAlarmRepository(await database());
    await repo.save(alarm);
    await repo.save({ ...alarm, id: 'alarm-2', isPrimary: true });
    expect((await repo.list()).filter((a) => a.isPrimary).map((a) => a.id)).toEqual(['alarm-2']);
  });
});

describe('SQLite occurrence repository', () => {
  it('round-trips an occurrence', async () => {
    const repo = createSqliteOccurrenceRepository(await database());
    const o = occurrence('o1', 100);
    await repo.insert(o);
    expect(await repo.get('o1')).toEqual(o);
    expect(await repo.findByEvent('alarm-1', 100)).toEqual(o);
    expect(await repo.get('missing')).toBeNull();
  });

  it('the database rejects a duplicate alarm event', async () => {
    const repo = createSqliteOccurrenceRepository(await database());
    const first = occurrence('o1', 100);
    await repo.insert(first);
    const done = dismissOccurrence(first, 101);
    if (!done.ok) throw new Error();
    await repo.update(done.occurrence, 'scheduled');

    await expect(repo.insert(occurrence('o2', 100))).rejects.toBeInstanceOf(DuplicateOccurrenceError);
  });

  it('the database rejects a second active occurrence for one alarm', async () => {
    const repo = createSqliteOccurrenceRepository(await database());
    await repo.insert(occurrence('o1', 100));
    await expect(repo.insert(occurrence('o2', 200))).rejects.toBeInstanceOf(DuplicateOccurrenceError);
    await expect(repo.insert(occurrence('o3', 200, 'alarm-2'))).resolves.toBeUndefined();
  });

  it('update is compare-and-set on status', async () => {
    const repo = createSqliteOccurrenceRepository(await database());
    const o = occurrence('o1', 100);
    await repo.insert(o);
    const started = markAlarmFired(o, 101);
    if (!started.ok) throw new Error();

    expect(await repo.update(started.occurrence, 'scheduled')).toBe(true);
    expect(await repo.update(started.occurrence, 'scheduled')).toBe(false);
    expect((await repo.get('o1'))?.status).toBe('alarm_fired');
  });

  it('lists active and recent occurrences', async () => {
    const repo = createSqliteOccurrenceRepository(await database());
    const old = dismissOccurrence(occurrence('old', 100), 101);
    if (!old.ok) throw new Error();
    await repo.insert(old.occurrence);
    await repo.insert(occurrence('a1', 200));
    await repo.insert(occurrence('a2', 300, 'alarm-2'));

    expect((await repo.listActive()).map((o) => o.id)).toEqual(['a1', 'a2']);
    expect((await repo.listRecent(2)).map((o) => o.id)).toEqual(['a2', 'a1']);
  });

  it('runs the full simulated flow and keeps history after reopening', async () => {
    const db = await database();
    const manager = createOccurrenceManager(async () => createSqliteOccurrenceRepository(db), () => 10_000);

    const o = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    await manager.startMission(o.id);
    const result = { difficulty: 'easy', questionCount: 3, attempts: 4, wrongAttempts: 1, accuracy: 0.75, durationMs: 9_000 } as const;
    await manager.completeMission(o.id, result);
    await expect(manager.completeMission(o.id, result)).rejects.toMatchObject({ code: 'already-finished' });

    const reopened = createOccurrenceManager(async () => createSqliteOccurrenceRepository(db), () => 20_000);
    const [saved] = await reopened.listRecent();
    expect(saved).toMatchObject({
      id: o.id,
      status: 'completed',
      result: { kind: 'mission_completed', mission: result },
    });
  });
});
