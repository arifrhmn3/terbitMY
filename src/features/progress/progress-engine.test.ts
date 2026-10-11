import { describe, expect, it } from '@jest/globals';

import type { CompletionMode } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { createSqliteOccurrenceRepository, occurrenceToRow } from '@/features/alarms/occurrence-repository';
import { migrate, migrations } from '@/services/storage/migrations';
import { createMemorySettingsStore, createSqliteSettingsStore } from '@/services/storage/settings';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import { dayKeyAtOffset } from './day';
import { buildMorning, exampleWeek, type MorningOutcome } from './example-mornings';
import { createProgressEngine } from './progress-engine';
import { createMemoryProgressRepository, createSqliteProgressRepository, type ProgressRepository } from './progress-repository';

const dayKey = dayKeyAtOffset(480);
const myt = (day: number, hour = 6, minute = 30) => Date.UTC(2026, 9, day, hour - 8, minute);

function setup(repository: ProgressRepository = createMemoryProgressRepository()) {
  const mornings: AlarmOccurrence[] = [];
  const clock = { time: myt(20, 12) };
  const engine = createProgressEngine({
    history: { listSince: async (since) => mornings.filter((o) => o.scheduledAt >= since) },
    repository: async () => repository,
    settings: createMemorySettingsStore(),
    now: () => clock.time,
    dayKey,
  });
  let seq = 0;
  const add = (day: number, outcome: MorningOutcome, mode: CompletionMode = 'reward') => {
    seq += 1;
    const o = buildMorning({ id: `m${seq}`, alarmId: 'main', scheduledAt: myt(day), outcome, mode });
    mornings.push(o);
    return o;
  };
  return { engine, mornings, add, clock, repository };
}

describe('progress engine: awarding XP', () => {
  it('the first successful mission awards XP once, however often it is processed', async () => {
    const ctx = setup();
    const o = ctx.add(1, 'completed');

    const first = await ctx.engine.sync();
    expect(first.xp).toEqual([expect.objectContaining({ occurrenceId: o.id, amount: 10, category: 'education' })]);
    expect(first.achievements.map((a) => a.id)).toEqual(['first_morning']);

    // App reload, mission screen reopened, resume, concurrent runs: nothing new.
    await Promise.all([ctx.engine.sync(), ctx.engine.sync()]);
    expect(await ctx.engine.sync()).toEqual({ xp: [], achievements: [] });
    expect((await ctx.engine.summary()).xp.total).toBe(10);
    expect(await ctx.engine.xpForOccurrence(o.id)).toHaveLength(1);
  });

  it('incomplete mornings earn nothing; Challenge earns the bonus', async () => {
    const ctx = setup();
    ctx.add(1, 'missed');
    ctx.add(2, 'dismissed', 'challenge');
    expect((await ctx.engine.summary()).xp.total).toBe(0);
    const challenge = ctx.add(3, 'completed', 'challenge');
    expect((await ctx.engine.xpForOccurrence(challenge.id)).map((e) => e.amount)).toEqual([10, 5]);
  });

  it('unlocks each achievement once and adds its bonus XP once', async () => {
    const ctx = setup();
    for (const day of [1, 2, 3]) ctx.add(day, 'completed');
    const awarded = await ctx.engine.sync();
    expect(awarded.achievements.map((a) => a.id)).toEqual(['first_morning', 'streak_3']);
    expect(awarded.xp.filter((e) => e.reason === 'achievement')).toEqual([
      expect.objectContaining({ key: 'ach:streak_3', amount: 10, category: null }),
    ]);

    // The streak breaks and is rebuilt: the 3-day achievement doesn't unlock (or pay) again.
    ctx.add(4, 'missed');
    for (const day of [5, 6, 7]) ctx.add(day, 'completed');
    const later = await ctx.engine.sync();
    expect(later.achievements).toEqual([]);
    const summary = await ctx.engine.summary();
    expect(summary.xp.total).toBe(6 * 10 + 10);
    expect(summary.morning.streak).toMatchObject({ current: 3, longest: 3 });
    expect(summary.achievements.find((a) => a.definition.id === 'streak_3')?.unlock).not.toBeNull();
  });

  it('tells subscribers only when something new was awarded', async () => {
    const ctx = setup();
    const seen: number[] = [];
    ctx.engine.subscribe((a) => seen.push(a.xp.length));
    ctx.add(1, 'completed');
    await ctx.engine.sync();
    await ctx.engine.sync();
    expect(seen).toEqual([1]);
  });

  it('summarises ranks, streaks and recent activity', async () => {
    const ctx = setup();
    for (const day of [1, 2, 3, 4, 5]) ctx.add(day, 'completed', day === 3 ? 'challenge' : 'reward');
    ctx.add(6, 'cancelled');
    const s = await ctx.engine.summary();
    // 5 × 10 + Challenge 5 + 3-day streak bonus 10.
    expect(s.xp.total).toBe(65);
    expect(s.xp.byCategory).toEqual({ education: 55, fitness: 0, faith: 0 });
    expect(s.ranks.overall).toMatchObject({ level: 2, nextAt: 150 });
    expect(s.ranks.education).toMatchObject({ level: 2, nextAt: 100 });
    expect(s.morning).toMatchObject({ successful: 5, scheduled: 5, streak: { current: 5, longest: 5 } });
    expect(s.recentXp[0].earnedAt).toBeGreaterThanOrEqual(s.recentXp[1].earnedAt);
  });
});

describe('progress engine: developer reset', () => {
  it('clears XP and achievements and ignores earlier mornings, without deleting them', async () => {
    const ctx = setup();
    ctx.add(1, 'completed');
    await ctx.engine.sync();
    await ctx.engine.reset(myt(10));
    const s = await ctx.engine.summary();
    expect(s.xp.total).toBe(0);
    expect(s.morning).toMatchObject({ successful: 0, scheduled: 0, streak: { current: 0, longest: 0 } });
    expect(ctx.mornings).toHaveLength(1);
    ctx.add(11, 'completed');
    expect((await ctx.engine.summary()).xp.total).toBe(10);
  });
});

describe('progress engine on real SQLite', () => {
  async function sqliteSetup() {
    const db = openTestDatabase();
    await migrate(db);
    const occurrences = createSqliteOccurrenceRepository(db);
    const engine = createProgressEngine({
      history: occurrences,
      repository: async () => createSqliteProgressRepository(db),
      settings: createSqliteSettingsStore(db),
      now: () => myt(20, 12),
      dayKey,
    });
    return { db, occurrences, engine };
  }

  it('the database itself refuses a second award for the same morning', async () => {
    const { db } = await sqliteSetup();
    const repo = createSqliteProgressRepository(db);
    const entry = { key: 'occ:x:mission', occurrenceId: 'x', category: 'education' as const, amount: 10, reason: 'mission_completed' as const, earnedAt: 1 };
    expect(await repo.addXp([entry])).toHaveLength(1);
    expect(await repo.addXp([entry, { ...entry, amount: 99 }])).toEqual([]);
    expect(await repo.listXp()).toEqual([entry]);
    const unlock = { id: 'first_morning', unlockedAt: 1, occurrenceId: 'x' };
    expect(await repo.unlock([unlock])).toHaveLength(1);
    expect(await repo.unlock([{ ...unlock, unlockedAt: 2 }])).toEqual([]);
  });

  it('awards the developer seed week once and keeps it after a "reload"', async () => {
    const { occurrences, engine, db } = await sqliteSetup();
    for (const o of exampleWeek(myt(20, 12))) await occurrences.insert(o);
    const s = await engine.summary();
    // Five completions (one Challenge) + 3-day streak bonus.
    expect(s.xp.total).toBe(5 * 10 + 5 + 10);
    expect(s.morning.streak).toMatchObject({ current: 5, longest: 5 });

    // A new engine on the same database (like an app restart) awards nothing more.
    const reopened = createProgressEngine({
      history: occurrences,
      repository: async () => createSqliteProgressRepository(db),
      settings: createSqliteSettingsStore(db),
      now: () => myt(20, 13),
      dayKey,
    });
    expect(await reopened.sync()).toEqual({ xp: [], achievements: [] });
    expect((await reopened.summary()).xp.total).toBe(65);
  });

  /** Inserts an occurrence the way a pre-migration-7 build stored it (no is_main_wake_up column). */
  async function insertOldRow(db: ReturnType<typeof openTestDatabase>, o: AlarmOccurrence) {
    const { is_main_wake_up: _dropped, ...row } = occurrenceToRow(o);
    const columns = Object.keys(row);
    await db.runAsync(
      `INSERT INTO alarm_occurrences (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      ...(Object.values(row) as (string | number | null)[]),
    );
  }

  it('migrations 6 and 7 upgrade a Phase 1 database, keep alarms and mornings, and freeze morning eligibility', async () => {
    const db = openTestDatabase();
    for (const [i, sql] of migrations.slice(0, 5).entries()) {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${i + 1}`);
    }
    // Phase 1 data: a main alarm, an evening alarm, and their completed occurrences,
    // plus one for an alarm deleted since and one developer-seed morning.
    for (const [id, primary] of [['main', 1], ['evening', 0]] as const) {
      await db.runAsync(
        `INSERT INTO alarms (id, hour, minute, weekdays, enabled, label, mission, snooze_enabled, snooze_minutes, is_primary, created_at, updated_at)
         VALUES (?, 6, 30, '1,2,3,4,5', 1, ?, '{"type":"math","difficulty":"easy","questionCount":3}', 1, 5, ?, 1, 1)`,
        id,
        id,
        primary,
      );
    }
    const old = [
      buildMorning({ id: 'main-1', alarmId: 'main', scheduledAt: myt(1), outcome: 'completed', source: 'native' }),
      buildMorning({ id: 'evening-1', alarmId: 'evening', scheduledAt: myt(1, 19), outcome: 'completed', source: 'native' }),
      buildMorning({ id: 'seed-2', alarmId: 'dev-seed', scheduledAt: myt(2), outcome: 'completed' }),
      buildMorning({ id: 'gone-3', alarmId: 'deleted-alarm', scheduledAt: myt(3), outcome: 'completed', source: 'native' }),
    ];
    for (const o of old) await insertOldRow(db, o);

    expect(await migrate(db)).toBe(2);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: migrations.length });
    expect(await db.getAllAsync('SELECT id, label FROM alarms ORDER BY id')).toEqual([
      { id: 'evening', label: 'evening' },
      { id: 'main', label: 'main' },
    ]);
    const repo = createSqliteOccurrenceRepository(db);
    const flags = async () => Object.fromEntries((await repo.listSince(0)).map((o) => [o.id, o.isMainWakeUp]));
    expect(await flags()).toEqual({ 'main-1': true, 'evening-1': false, 'seed-2': true, 'gone-3': false });
    // Everything else about the old mornings survives.
    expect({ ...(await repo.get('main-1')), isMainWakeUp: undefined }).toEqual({ ...old[0], isMainWakeUp: undefined });

    // Changing the main alarm later doesn't rewrite history.
    await db.runAsync(`UPDATE alarms SET is_primary = CASE id WHEN 'evening' THEN 1 ELSE 0 END`);
    expect(await flags()).toEqual({ 'main-1': true, 'evening-1': false, 'seed-2': true, 'gone-3': false });

    const engine = createProgressEngine({
      history: repo,
      repository: async () => createSqliteProgressRepository(db),
      settings: createSqliteSettingsStore(db),
      now: () => myt(4),
      dayKey,
    });
    const s = await engine.summary();
    expect(s.xp).toEqual({ total: 40, byCategory: { education: 40, fitness: 0, faith: 0 }, general: 0 });
    expect(s.morning).toMatchObject({ successful: 2, scheduled: 2, streak: { current: 2 } });
    expect(s.general).toMatchObject({ successful: 4, scheduled: 4 });
  });

  it('new occurrences store whether they were the main wake-up alarm', async () => {
    const { occurrences } = await sqliteSetup();
    await occurrences.insert(buildMorning({ id: 'm', scheduledAt: myt(1), outcome: 'completed', mainWakeUp: true }));
    await occurrences.insert(buildMorning({ id: 'e', scheduledAt: myt(1, 19), outcome: 'completed', mainWakeUp: false }));
    expect((await occurrences.get('m'))?.isMainWakeUp).toBe(true);
    expect((await occurrences.get('e'))?.isMainWakeUp).toBe(false);
  });
});
