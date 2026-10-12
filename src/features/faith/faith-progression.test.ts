import { describe, expect, it } from '@jest/globals';

import type { AlarmMission, CompletionMode } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { createSqliteOccurrenceRepository } from '@/features/alarms/occurrence-repository';
import { dayKeyAtOffset } from '@/features/progress/day';
import { buildMorning, type MorningOutcome } from '@/features/progress/example-mornings';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { createProgressEngine } from '@/features/progress/progress-engine';
import { createMemoryProgressRepository, createSqliteProgressRepository } from '@/features/progress/progress-repository';
import { xpForMorning } from '@/features/progress/progression';
import { migrate } from '@/services/storage/migrations';
import { createMemorySettingsStore, createSqliteSettingsStore } from '@/services/storage/settings';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

const myt = (day: number, hour = 6) => Date.UTC(2026, 9, day, hour - 8, 30);
const dayKey = dayKeyAtOffset(480);

const RECITATION: AlarmMission = { type: 'recitation', tradition: 'islam' };
const reflection = (difficulty: 'easy' | 'medium' | 'hard' = 'easy'): AlarmMission => ({ type: 'reflection', difficulty });

let seq = 0;
function faithMorning(
  day: number,
  opts: { mission?: AlarmMission; outcome?: MorningOutcome; mode?: CompletionMode; mainWakeUp?: boolean } = {},
): AlarmOccurrence {
  seq += 1;
  return buildMorning({
    id: `faith-${seq}`,
    alarmId: opts.mainWakeUp === false ? 'evening-faith' : 'main-faith',
    scheduledAt: myt(day, opts.mainWakeUp === false ? 20 : 6),
    outcome: opts.outcome ?? 'completed',
    mode: opts.mode,
    mainWakeUp: opts.mainWakeUp,
    mission: opts.mission ?? RECITATION,
  });
}

function setup() {
  const mornings: AlarmOccurrence[] = [];
  const repo = createMemoryProgressRepository();
  const engine = createProgressEngine({
    history: { listSince: async (since) => mornings.filter((o) => o.scheduledAt >= since) },
    repository: async () => repo,
    settings: createMemorySettingsStore(),
    now: () => myt(25, 12),
    dayKey,
  });
  return { mornings, engine };
}

describe('Faith XP (central policy)', () => {
  it('Recitation and Reflection both earn Faith XP', () => {
    for (const mission of [RECITATION, reflection()]) {
      expect(xpForMorning(faithMorning(1, { mission }), PROGRESSION_POLICY)).toEqual([
        expect.objectContaining({ category: 'faith', amount: 10, reason: 'mission_completed' }),
      ]);
    }
  });

  it('Reflection uses the shared difficulty bonus (its length); Recitation has no difficulty', () => {
    expect(xpForMorning(faithMorning(1, { mission: reflection('medium') }), PROGRESSION_POLICY)[0].amount).toBe(12);
    expect(xpForMorning(faithMorning(1, { mission: reflection('hard') }), PROGRESSION_POLICY)[0].amount).toBe(15);
    expect(xpForMorning(faithMorning(1, { mission: RECITATION }), PROGRESSION_POLICY)[0].amount).toBe(10);
  });

  it('Challenge uses the existing Challenge bonus; incomplete earns nothing', () => {
    expect(xpForMorning(faithMorning(1, { mode: 'challenge' }), PROGRESSION_POLICY).map((e) => [e.reason, e.amount])).toEqual([
      ['mission_completed', 10],
      ['mode_bonus', 5],
    ]);
    for (const outcome of ['missed', 'dismissed', 'open'] as const) {
      expect(xpForMorning(faithMorning(1, { outcome }), PROGRESSION_POLICY)).toEqual([]);
    }
  });
});

describe('Faith missions through the progress engine', () => {
  it('awards Faith XP once, counts toward Faith rank and Total XP, and unlocks First Faith mission', async () => {
    const ctx = setup();
    const o = faithMorning(1, { mode: 'challenge' });
    ctx.mornings.push(o);
    const awards = await ctx.engine.awardsForOccurrence(o.id);
    expect(awards.xp.map((e) => e.amount)).toEqual([10, 5]);
    expect(awards.achievements.map((a) => a.id)).toContain('first_faith');

    // Reopening the result (and background syncs) never awards it again.
    await Promise.all([ctx.engine.sync(), ctx.engine.awardsForOccurrence(o.id), ctx.engine.sync()]);
    const s = await ctx.engine.summary();
    expect(s.xp).toEqual({ total: 15, byCategory: { education: 0, fitness: 0, faith: 15 }, general: 0 });
    expect(s.ranks.faith).toMatchObject({ level: 1, nextAt: 30 });
  });

  it('Faith rank rises with Faith XP from either mission', async () => {
    const ctx = setup();
    ctx.mornings.push(
      faithMorning(1, { mission: reflection('hard'), mainWakeUp: false }),
      faithMorning(2, { mission: RECITATION, mainWakeUp: false }),
      faithMorning(3, { mission: reflection('hard'), mainWakeUp: false }),
    );
    const s = await ctx.engine.summary();
    expect(s.xp.byCategory.faith).toBe(40);
    expect(s.ranks.faith).toMatchObject({ level: 2 });
  });

  it('Main Wake-Up Faith counts as the morning; other alarms only update Faith XP and All alarms', async () => {
    const ctx = setup();
    ctx.mornings.push(faithMorning(1), faithMorning(2, { mission: reflection() }), faithMorning(3, { outcome: 'missed' }));
    const before = await ctx.engine.summary();
    expect(before.morning).toMatchObject({ successful: 2, scheduled: 3, streak: { current: 0, longest: 2 } });

    ctx.mornings.push(faithMorning(3, { mainWakeUp: false }), faithMorning(4, { mainWakeUp: false, mission: reflection() }));
    const after = await ctx.engine.summary();
    expect(after.morning).toEqual(before.morning);
    expect(after.general).toMatchObject({ successful: 4, scheduled: 5, missionsCompleted: 4 });
    expect(after.xp.byCategory.faith).toBe(40);
  });

  it('other missions don’t unlock First Faith mission', async () => {
    const ctx = setup();
    ctx.mornings.push(buildMorning({ id: 'm', scheduledAt: myt(1), outcome: 'completed' }));
    const s = await ctx.engine.summary();
    expect(s.achievements.find((a) => a.definition.id === 'first_faith')?.unlock).toBeNull();
  });

  it('survives a restart: the result and XP are still there and nothing is awarded again', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const occurrences = createSqliteOccurrenceRepository(db);
    const engineOn = () =>
      createProgressEngine({
        history: occurrences,
        repository: async () => createSqliteProgressRepository(db),
        settings: createSqliteSettingsStore(db),
        now: () => myt(25, 12),
        dayKey,
      });
    const o = faithMorning(1, { mission: reflection('medium') });
    await occurrences.insert(o);
    expect((await engineOn().summary()).xp.byCategory.faith).toBe(12);

    const restarted = engineOn();
    expect(await restarted.sync()).toEqual({ xp: [], achievements: [] });
    expect((await restarted.summary()).xp.byCategory.faith).toBe(12);
    expect((await occurrences.get(o.id))?.result).toEqual(o.result);
  });
});
