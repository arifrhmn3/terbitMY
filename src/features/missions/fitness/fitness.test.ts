import { describe, expect, it } from '@jest/globals';

import { describeMission, type AlarmMission } from '@/features/alarms/alarm';
import { parseMission } from '@/features/alarms/alarm-repository';
import { toHistoryEntry } from '@/features/alarms/history';
import { buildMorning } from '@/features/progress/example-mornings';

import { MISSION_DIFFICULTIES, isFitnessResult, isMathResult, isQuizResult } from '../types';
import { EXERCISES, FITNESS_CATALOGUES, FITNESS_COUNTDOWN_MS, FITNESS_TARGETS, fitnessTarget, formatTarget } from './exercises';
import {
  countdownLeft,
  createFitnessSession,
  elapsedMs,
  fitnessPhase,
  fitnessResult,
  pauseFitness,
  recordRep,
  remainingMs,
  resumeFitness,
  startFitness,
  tickFitness,
  type FitnessSession,
} from './session';
import { FITNESS_EXERCISES, MOBILITY_PROFILES } from './types';

const T0 = 1_000_000;
const ACTIVE = T0 + FITNESS_COUNTDOWN_MS;

/** Taps one rep every `gapMs` from `from`, `count` times. */
function tapReps(s: FitnessSession, count: number, from: number, gapMs: number) {
  let session = s;
  for (let i = 0; i < count; i++) session = recordRep(session, from + i * gapMs).session;
  return session;
}

describe('exercise catalogue and targets', () => {
  it('the Standard catalogue has the five exercises: three rep-based, two timed', () => {
    const standard = FITNESS_CATALOGUES.standard;
    expect(standard).toEqual(['pushups', 'squats', 'jumping_jacks', 'stretch', 'walk_in_place']);
    expect(standard.filter((e) => EXERCISES[e].kind === 'reps')).toEqual(['pushups', 'squats', 'jumping_jacks']);
    expect(standard.filter((e) => EXERCISES[e].kind === 'timed')).toEqual(['stretch', 'walk_in_place']);
  });

  it('every activity belongs to exactly one Mobility Profile catalogue', () => {
    const all = MOBILITY_PROFILES.flatMap((p) => FITNESS_CATALOGUES[p]);
    expect([...all].sort()).toEqual([...FITNESS_EXERCISES].sort());
    for (const p of MOBILITY_PROFILES) for (const e of FITNESS_CATALOGUES[p]) expect(EXERCISES[e].profile).toBe(p);
  });

  it('maps difficulty to the prototype targets, rising with difficulty', () => {
    expect(FITNESS_TARGETS).toMatchObject({
      pushups: { easy: 5, medium: 10, hard: 20 },
      squats: { easy: 10, medium: 20, hard: 30 },
      jumping_jacks: { easy: 15, medium: 30, hard: 50 },
      stretch: { easy: 30, medium: 60, hard: 120 },
      walk_in_place: { easy: 60, medium: 120, hard: 180 },
    });
    for (const e of FITNESS_EXERCISES) {
      const [easy, medium, hard] = MISSION_DIFFICULTIES.map((d) => fitnessTarget(e, d));
      expect(easy).toBeLessThan(medium);
      expect(medium).toBeLessThan(hard);
    }
    expect(formatTarget('squats', 'medium')).toBe('20 reps');
    expect(formatTarget('stretch', 'hard')).toBe('2 min');
    expect(formatTarget('stretch', 'easy')).toBe('30 sec');
  });

});

describe('rep-based missions', () => {
  it('starts with a countdown; reps only count once it ends', () => {
    let s = startFitness(createFitnessSession({ exercise: 'squats', difficulty: 'easy' }), T0);
    expect(fitnessPhase(s, T0)).toBe('countdown');
    expect(countdownLeft(s, T0)).toBe(3);
    expect(recordRep(s, T0 + 1000).outcome).toBe('not_active');
    expect(fitnessPhase(s, ACTIVE)).toBe('active');
    s = recordRep(s, ACTIVE).session;
    expect(s.reps).toBe(1);
  });

  it('ignores taps faster than a real rep, so it can’t be finished by rapid tapping', () => {
    const s = startFitness(createFitnessSession({ exercise: 'squats', difficulty: 'easy' }), T0);
    // 9 taps, 100 ms apart (within one 900 ms rep): only the first counts.
    const rushed = tapReps(s, 9, ACTIVE, 100);
    expect(rushed.reps).toBe(1);
    expect(recordRep(rushed, ACTIVE + 200).outcome).toBe('too_fast');
    // At a realistic pace each tap counts.
    expect(tapReps(s, 5, ACTIVE, 1000).reps).toBe(5);
  });

  it('completes exactly at the target and records a self-reported result', () => {
    for (const exercise of ['pushups', 'squats', 'jumping_jacks'] as const) {
      const s0 = startFitness(createFitnessSession({ exercise, difficulty: 'medium' }), T0);
      const target = fitnessTarget(exercise, 'medium');
      const almost = tapReps(s0, target - 1, ACTIVE, 1000);
      expect(fitnessResult(almost)).toBeNull();
      const done = recordRep(almost, ACTIVE + target * 1000).session;
      expect(fitnessPhase(done, ACTIVE + target * 1000)).toBe('done');
      expect(fitnessResult(done)).toEqual({
        type: 'fitness',
        exercise,
        difficulty: 'medium',
        kind: 'reps',
        target,
        achieved: target,
        durationMs: target * 1000,
        verification: 'self_reported',
      });
      // Extra taps after completion change nothing.
      expect(recordRep(done, ACTIVE + target * 1000 + 5000).outcome).toBe('not_active');
    }
  });

  it('is incomplete until the target is reached (abandoning leaves no result)', () => {
    const s = tapReps(startFitness(createFitnessSession({ exercise: 'pushups', difficulty: 'hard' }), T0), 7, ACTIVE, 1000);
    expect(s.reps).toBe(7);
    expect(fitnessResult(s)).toBeNull();
    expect(fitnessResult(createFitnessSession({ exercise: 'pushups', difficulty: 'easy' }))).toBeNull();
  });
});

describe('timed missions', () => {
  it('counts down from the end of the countdown and completes at the exact time', () => {
    for (const exercise of ['stretch', 'walk_in_place'] as const) {
      let s = startFitness(createFitnessSession({ exercise, difficulty: 'easy' }), T0);
      const targetMs = fitnessTarget(exercise, 'easy') * 1000;
      expect(remainingMs(s, T0 + 1000)).toBe(targetMs); // still counting down
      s = tickFitness(s, ACTIVE + targetMs - 1);
      expect(fitnessResult(s)).toBeNull();
      s = tickFitness(s, ACTIVE + targetMs + 7000); // ticked late (e.g. app was in the background)
      expect(fitnessResult(s)).toMatchObject({ kind: 'timed', achieved: targetMs / 1000, durationMs: targetMs });
    }
  });

  it('uses timestamps, not screen ticks: time passes in the background', () => {
    const s = startFitness(createFitnessSession({ exercise: 'stretch', difficulty: 'medium' }), T0);
    // No ticks at all for 45 s (app in the background): elapsed time is still right.
    expect(elapsedMs(s, ACTIVE + 45_000)).toBe(45_000);
    expect(remainingMs(s, ACTIVE + 45_000)).toBe(15_000);
  });

  it('pausing stops the clock; resuming continues it', () => {
    let s = startFitness(createFitnessSession({ exercise: 'stretch', difficulty: 'easy' }), T0);
    s = pauseFitness(s, ACTIVE + 10_000);
    expect(elapsedMs(s, ACTIVE + 60_000)).toBe(10_000);
    expect(tickFitness(s, ACTIVE + 60_000)).toBe(s); // can't complete while paused
    s = resumeFitness(s, ACTIVE + 60_000);
    s = tickFitness(s, ACTIVE + 79_999);
    expect(fitnessResult(s)).toBeNull();
    s = tickFitness(s, ACTIVE + 80_000);
    expect(fitnessResult(s)).toMatchObject({ durationMs: 80_000, achieved: 30 });
  });

  it('can’t pause before it starts or count reps', () => {
    const s = createFitnessSession({ exercise: 'walk_in_place', difficulty: 'easy' });
    expect(pauseFitness(s, T0)).toBe(s);
    expect(recordRep(startFitness(s, T0), ACTIVE).outcome).toBe('not_active');
  });
});

describe('fitness alarms are stored like any mission', () => {
  it('round-trips through storage; bad data falls back to the default', () => {
    const mission: AlarmMission = { type: 'fitness', exercise: 'jumping_jacks', difficulty: 'hard' };
    expect(parseMission(JSON.stringify(mission))).toEqual(mission);
    expect(parseMission(JSON.stringify({ ...mission, exercise: 'burpees' })).type).toBe('math');
    expect(parseMission(JSON.stringify({ ...mission, adaptation: 'teleport' })).type).toBe('math');
    expect(parseMission(JSON.stringify({ ...mission, adaptation: 'standard' }))).toEqual({ ...mission, adaptation: 'standard' });
  });

  it('is described and shown in history in plain language, marked self-reported', () => {
    expect(describeMission({ type: 'fitness', exercise: 'squats', difficulty: 'medium' })).toBe('Squats · Medium · 20 reps');
    expect(describeMission({ type: 'fitness', exercise: 'walk_in_place', difficulty: 'hard' })).toBe('Walk in place · Hard · 3 min');
    const o = buildMorning({
      id: 'f1',
      scheduledAt: Date.UTC(2026, 9, 12, 22, 30),
      outcome: 'completed',
      mission: { type: 'fitness', exercise: 'squats', difficulty: 'easy' },
    });
    expect(toHistoryEntry(o).completion).toMatch(/Squats 10 reps \(self-reported\)$/);
    const result = o.result?.kind === 'mission_completed' ? o.result.mission : null;
    expect(result && isFitnessResult(result)).toBe(true);
    expect(result && (isQuizResult(result) || isMathResult(result))).toBe(false);
  });
});
