import { describe, expect, it } from '@jest/globals';

import type { CompletionMode } from '@/features/alarms/alarm';
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

import type { MissionDifficulty } from '../types';
import type { FitnessExercise } from './types';

const myt = (day: number, hour = 6) => Date.UTC(2026, 9, day, hour - 8, 30);
const dayKey = dayKeyAtOffset(480);

let seq = 0;
function fitnessMorning(
  day: number,
  opts: {
    outcome?: MorningOutcome;
    exercise?: FitnessExercise;
    difficulty?: MissionDifficulty;
    mode?: CompletionMode;
    mainWakeUp?: boolean;
  } = {},
): AlarmOccurrence {
  seq += 1;
  return buildMorning({
    id: `fit-${seq}`,
    alarmId: opts.mainWakeUp === false ? 'evening-fitness' : 'main-fitness',
    scheduledAt: myt(day, opts.mainWakeUp === false ? 19 : 6),
    outcome: opts.outcome ?? 'completed',
    mode: opts.mode,
    mainWakeUp: opts.mainWakeUp,
    mission: { type: 'fitness', exercise: opts.exercise ?? 'squats', difficulty: opts.difficulty ?? 'easy' },
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

describe('fitness XP (central policy)', () => {
  it('every exercise earns Fitness XP, with the shared difficulty bonus', () => {
    for (const exercise of ['pushups', 'squats', 'jumping_jacks', 'stretch', 'walk_in_place'] as const) {
      expect(xpForMorning(fitnessMorning(1, { exercise }), PROGRESSION_POLICY)).toEqual([
        expect.objectContaining({ category: 'fitness', amount: 10, reason: 'mission_completed' }),
      ]);
    }
    expect(xpForMorning(fitnessMorning(1, { difficulty: 'medium' }), PROGRESSION_POLICY)[0].amount).toBe(12);
    expect(xpForMorning(fitnessMorning(1, { difficulty: 'hard' }), PROGRESSION_POLICY)[0].amount).toBe(15);
  });

  it('Challenge uses the existing Challenge bonus; Reward and Gentle earn normal XP; incomplete earns nothing', () => {
    expect(xpForMorning(fitnessMorning(1, { mode: 'challenge' }), PROGRESSION_POLICY).map((e) => [e.reason, e.amount])).toEqual([
      ['mission_completed', 10],
      ['mode_bonus', 5],
    ]);
    for (const mode of ['reward', 'gentle'] as const) {
      expect(xpForMorning(fitnessMorning(1, { mode }), PROGRESSION_POLICY).map((e) => e.amount)).toEqual([10]);
    }
    for (const outcome of ['missed', 'dismissed', 'open'] as const) {
      expect(xpForMorning(fitnessMorning(1, { outcome }), PROGRESSION_POLICY)).toEqual([]);
    }
  });
});

describe('fitness missions through the progress engine', () => {
  it('awards Fitness XP once, counts toward Fitness rank and Total XP, and unlocks First Fitness', async () => {
    const ctx = setup();
    const o = fitnessMorning(1, { mode: 'challenge', difficulty: 'hard' });
    ctx.mornings.push(o);
    const awards = await ctx.engine.awardsForOccurrence(o.id);
    expect(awards.xp.map((e) => e.amount)).toEqual([15, 5]);
    expect(awards.achievements.map((a) => a.id).sort()).toEqual(['first_challenge', 'first_fitness', 'first_morning']);

    await Promise.all([ctx.engine.sync(), ctx.engine.awardsForOccurrence(o.id), ctx.engine.sync()]);
    const s = await ctx.engine.summary();
    expect(s.xp).toEqual({ total: 20, byCategory: { education: 0, fitness: 20, faith: 0 }, general: 0 });
    expect(s.ranks.fitness).toMatchObject({ level: 1, nextAt: 30 });
  });

  it('Fitness rank rises with Fitness XP', async () => {
    const ctx = setup();
    for (const day of [1, 2, 3]) ctx.mornings.push(fitnessMorning(day, { difficulty: 'medium', mainWakeUp: false }));
    const s = await ctx.engine.summary();
    expect(s.xp.byCategory.fitness).toBe(36);
    expect(s.ranks.fitness).toMatchObject({ level: 2, label: 'Rank 2' });
  });

  it('Main Wake-Up fitness counts as the morning; other alarms only update Fitness XP and All alarms', async () => {
    const ctx = setup();
    ctx.mornings.push(fitnessMorning(1), fitnessMorning(2), fitnessMorning(3, { outcome: 'missed' }));
    const before = await ctx.engine.summary();
    expect(before.morning).toMatchObject({ successful: 2, scheduled: 3, streak: { current: 0, longest: 2 } });

    ctx.mornings.push(fitnessMorning(3, { mainWakeUp: false }), fitnessMorning(4, { mainWakeUp: false, outcome: 'dismissed' }));
    const after = await ctx.engine.summary();
    expect(after.morning).toEqual(before.morning);
    expect(after.general).toMatchObject({ successful: 3, scheduled: 5, missionsCompleted: 3 });
    expect(after.xp.byCategory.fitness).toBe(30);
  });

  it('Maths and Quiz still earn Education XP, and don’t unlock First Fitness', async () => {
    const ctx = setup();
    ctx.mornings.push(
      buildMorning({ id: 'm', scheduledAt: myt(1), outcome: 'completed' }),
      buildMorning({ id: 'q', scheduledAt: myt(2), outcome: 'completed', mission: { type: 'quiz', category: 'logic', difficulty: 'easy', questionCount: 3 } }),
    );
    const s = await ctx.engine.summary();
    expect(s.xp.byCategory).toEqual({ education: 20, fitness: 0, faith: 0 });
    expect(s.achievements.find((a) => a.definition.id === 'first_fitness')?.unlock).toBeNull();
  });

  it('persists on the phone: after a restart the result and XP are still there, and nothing is awarded again', async () => {
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
    const o = fitnessMorning(1, { exercise: 'walk_in_place', difficulty: 'medium' });
    await occurrences.insert(o);
    expect((await engineOn().summary()).xp.byCategory.fitness).toBe(12);

    // "Restart": new engine, same database.
    const restarted = engineOn();
    expect(await restarted.sync()).toEqual({ xp: [], achievements: [] });
    expect((await restarted.summary()).xp.byCategory.fitness).toBe(12);
    const stored = await occurrences.get(o.id);
    expect(stored?.result).toEqual(o.result);
  });
});
