import { describe, expect, it } from '@jest/globals';

import type { CompletionMode } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { dayKeyAtOffset } from '@/features/progress/day';
import { buildMorning, type MorningOutcome } from '@/features/progress/example-mornings';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { createProgressEngine } from '@/features/progress/progress-engine';
import { createMemoryProgressRepository } from '@/features/progress/progress-repository';
import { xpForMorning } from '@/features/progress/progression';
import { createMemorySettingsStore } from '@/services/storage/settings';

import type { MissionDifficulty } from '../types';
import type { QuizCategory } from './types';

const myt = (day: number, hour = 6) => Date.UTC(2026, 9, day, hour - 8, 30);

let seq = 0;
function quizMorning(
  day: number,
  opts: {
    outcome?: MorningOutcome;
    category?: QuizCategory;
    difficulty?: MissionDifficulty;
    mode?: CompletionMode;
    mainWakeUp?: boolean;
    hour?: number;
  } = {},
): AlarmOccurrence {
  seq += 1;
  return buildMorning({
    id: `quiz-${seq}`,
    alarmId: opts.mainWakeUp === false ? 'evening-quiz' : 'main-quiz',
    scheduledAt: myt(day, opts.hour ?? (opts.mainWakeUp === false ? 19 : 6)),
    outcome: opts.outcome ?? 'completed',
    mode: opts.mode,
    mainWakeUp: opts.mainWakeUp,
    mission: { type: 'quiz', category: opts.category ?? 'general', difficulty: opts.difficulty ?? 'easy', questionCount: 5 },
  });
}

function setup() {
  const mornings: AlarmOccurrence[] = [];
  const engine = createProgressEngine({
    history: { listSince: async (since) => mornings.filter((o) => o.scheduledAt >= since) },
    repository: async () => repo,
    settings: createMemorySettingsStore(),
    now: () => myt(25, 12),
    dayKey: dayKeyAtOffset(480),
  });
  const repo = createMemoryProgressRepository();
  return { mornings, engine };
}

describe('quiz XP (central policy)', () => {
  it('every topic earns Education XP; difficulty adds its bonus', () => {
    for (const category of ['general', 'geography', 'vocabulary', 'logic'] as const) {
      const [entry] = xpForMorning(quizMorning(1, { category }), PROGRESSION_POLICY);
      expect(entry).toMatchObject({ category: 'education', amount: 10, reason: 'mission_completed' });
    }
    expect(xpForMorning(quizMorning(1, { difficulty: 'medium' }), PROGRESSION_POLICY)[0].amount).toBe(12);
    expect(xpForMorning(quizMorning(1, { difficulty: 'hard' }), PROGRESSION_POLICY)[0].amount).toBe(15);
  });

  it('Challenge adds the existing Challenge bonus (no separate quiz bonus)', () => {
    const xp = xpForMorning(quizMorning(1, { mode: 'challenge', difficulty: 'hard' }), PROGRESSION_POLICY);
    expect(xp.map((e) => [e.reason, e.amount])).toEqual([
      ['mission_completed', 15],
      ['mode_bonus', 5],
    ]);
  });

  it('Reward and Gentle earn the normal XP; an unfinished quiz earns nothing', () => {
    for (const mode of ['reward', 'gentle'] as const) {
      expect(xpForMorning(quizMorning(1, { mode }), PROGRESSION_POLICY).map((e) => e.amount)).toEqual([10]);
    }
    for (const outcome of ['missed', 'dismissed', 'open'] as const) {
      expect(xpForMorning(quizMorning(1, { outcome }), PROGRESSION_POLICY)).toEqual([]);
    }
  });

  it('maths XP is unchanged at Easy (difficulty bonus applies to every mission type)', () => {
    const maths = buildMorning({ id: 'm', scheduledAt: myt(1), outcome: 'completed' });
    expect(xpForMorning(maths, PROGRESSION_POLICY).map((e) => e.amount)).toEqual([10]);
  });
});

describe('quiz missions through the progress engine', () => {
  it('awards a completed quiz once, however often it is processed, and reports what it earned', async () => {
    const ctx = setup();
    const o = quizMorning(1, { mode: 'challenge' });
    ctx.mornings.push(o);
    const awards = await ctx.engine.awardsForOccurrence(o.id);
    expect(awards.xp.map((e) => e.amount)).toEqual([10, 5]);
    expect(awards.achievements.map((a) => a.id)).toEqual(['first_morning', 'first_challenge']);

    await Promise.all([ctx.engine.sync(), ctx.engine.sync(), ctx.engine.awardsForOccurrence(o.id)]);
    const s = await ctx.engine.summary();
    expect(s.xp).toEqual({ total: 15, byCategory: { education: 15, fitness: 0, faith: 0 }, general: 0 });
  });

  it('a quiz on the Main Wake-Up Alarm counts as a morning and builds the morning streak', async () => {
    const ctx = setup();
    ctx.mornings.push(quizMorning(1), quizMorning(2, { category: 'logic' }), quizMorning(3, { outcome: 'missed' }), quizMorning(4));
    const s = await ctx.engine.summary();
    expect(s.morning).toMatchObject({ successful: 3, scheduled: 4, streak: { current: 1, longest: 2 } });
  });

  it('a quiz on any other alarm earns Education XP and counts in All alarms, but never touches morning statistics', async () => {
    const ctx = setup();
    ctx.mornings.push(quizMorning(1), quizMorning(2));
    const before = await ctx.engine.summary();

    ctx.mornings.push(quizMorning(2, { mainWakeUp: false }), quizMorning(3, { mainWakeUp: false }), quizMorning(3, { mainWakeUp: false, outcome: 'missed', hour: 21 }));
    const after = await ctx.engine.summary();
    expect(after.morning).toEqual(before.morning);
    expect(after.general).toMatchObject({ successful: 4, scheduled: 5, missionsCompleted: 4 });
    expect(after.xp.byCategory.education).toBe(40);
  });

  it('mission achievements count quizzes on every alarm', async () => {
    const ctx = setup();
    for (let day = 1; day <= 10; day++) ctx.mornings.push(quizMorning(day, { mainWakeUp: false }));
    const s = await ctx.engine.summary();
    const unlocked = s.achievements.filter((a) => a.unlock).map((a) => a.definition.id);
    expect(unlocked).toEqual(['missions_10']);
  });
});
