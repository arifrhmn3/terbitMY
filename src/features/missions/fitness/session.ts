import { createRandom } from '../math/random';
import { EXERCISES, FITNESS_COUNTDOWN_MS, fitnessTarget, SEQUENCE_LENGTH } from './exercises';
import type { FitnessKind, FitnessMissionConfig, FitnessMissionResult } from './types';

/**
 * One Fitness mission, as pure state. Every function takes `now`, and all
 * progress is worked out from timestamps (never from screen ticks), so a
 * slow screen or the app going to the background can't distort the time.
 *
 *   ready ─Start─► countdown ─► active ─target reached─► done
 *
 * Four building blocks, shared by every Mobility Profile's catalogue:
 * - reps: each counted rep must be at least `minRepIntervalMs` after the previous one;
 * - timed: the timer runs from the end of the countdown and can be paused;
 * - holds: a press counts when held for at least `minHoldMs`;
 * - sequence: tap 1…9 in order (shuffled each round); each round counts.
 * Abandoning is the alarm screen's existing "skip / give up".
 */
export type FitnessPhase = 'ready' | 'countdown' | 'active' | 'done';

export type FitnessSession = {
  config: FitnessMissionConfig;
  kind: FitnessKind;
  /** Reps, seconds, holds or rounds. */
  target: number;
  countdownMs: number;
  minRepIntervalMs: number;
  minHoldMs: number;
  /** When Start was tapped (the countdown begins). */
  startedAt: number | null;
  /** Reps, holds or completed rounds. */
  reps: number;
  lastRepAt: number | null;
  /** Timed: when the current pause began, and the total paused before it. */
  pausedAt: number | null;
  pausedMs: number;
  /** Sequence: this round's shuffled numbers, and the next number to tap. */
  grid: number[];
  nextNumber: number;
  seed: number;
  completedAt: number | null;
};

function shuffledGrid(seed: number, round: number): number[] {
  const random = createRandom(seed + round * 7919);
  const grid = Array.from({ length: SEQUENCE_LENGTH }, (_, i) => i + 1);
  for (let i = grid.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [grid[i], grid[j]] = [grid[j], grid[i]];
  }
  return grid;
}

export function createFitnessSession(config: FitnessMissionConfig, seed = Math.floor(Math.random() * 2 ** 31)): FitnessSession {
  const exercise = EXERCISES[config.exercise];
  return {
    config,
    kind: exercise.kind,
    target: fitnessTarget(config.exercise, config.difficulty),
    countdownMs: config.countdownMs ?? FITNESS_COUNTDOWN_MS,
    minRepIntervalMs: exercise.minRepIntervalMs ?? 0,
    minHoldMs: exercise.minHoldMs ?? 0,
    startedAt: null,
    reps: 0,
    lastRepAt: null,
    pausedAt: null,
    pausedMs: 0,
    grid: exercise.kind === 'sequence' ? shuffledGrid(seed, 0) : [],
    nextNumber: 1,
    seed,
    completedAt: null,
  };
}

/** When the activity itself starts (after the countdown). */
function activeFrom(s: FitnessSession): number | null {
  return s.startedAt === null ? null : s.startedAt + s.countdownMs;
}

export function fitnessPhase(s: FitnessSession, now: number): FitnessPhase {
  if (s.completedAt !== null) return 'done';
  const from = activeFrom(s);
  if (from === null) return 'ready';
  return now < from ? 'countdown' : 'active';
}

/** Whole seconds left in the countdown (3, 2, 1). */
export function countdownLeft(s: FitnessSession, now: number): number {
  const from = activeFrom(s);
  return from === null ? 0 : Math.max(0, Math.ceil((from - now) / 1000));
}

export function startFitness(s: FitnessSession, now: number): FitnessSession {
  return s.startedAt === null ? { ...s, startedAt: now } : s;
}

export type RepOutcome = 'counted' | 'too_fast' | 'too_short' | 'wrong' | 'not_active';

/** Reps: counts one rep if the activity is active and the previous rep wasn't too recent. */
export function recordRep(s: FitnessSession, now: number): { session: FitnessSession; outcome: RepOutcome } {
  if (s.kind !== 'reps' || fitnessPhase(s, now) !== 'active') return { session: s, outcome: 'not_active' };
  if (s.lastRepAt !== null && now - s.lastRepAt < s.minRepIntervalMs) return { session: s, outcome: 'too_fast' };
  const reps = s.reps + 1;
  return {
    session: { ...s, reps, lastRepAt: now, completedAt: reps >= s.target ? now : null },
    outcome: 'counted',
  };
}

/** Holds: a press from `pressedAt` to `releasedAt` counts if it started while active and lasted long enough. */
export function recordHold(s: FitnessSession, pressedAt: number, releasedAt: number): { session: FitnessSession; outcome: RepOutcome } {
  if (s.kind !== 'holds' || fitnessPhase(s, pressedAt) !== 'active' || fitnessPhase(s, releasedAt) !== 'active') {
    return { session: s, outcome: 'not_active' };
  }
  if (releasedAt - pressedAt < s.minHoldMs) return { session: s, outcome: 'too_short' };
  const reps = s.reps + 1;
  return {
    session: { ...s, reps, lastRepAt: releasedAt, completedAt: reps >= s.target ? releasedAt : null },
    outcome: 'counted',
  };
}

/** Sequence: tapping the next number moves on; 9 completes a round (and shuffles a new one). Wrong taps cost nothing. */
export function tapNumber(s: FitnessSession, n: number, now: number): { session: FitnessSession; outcome: RepOutcome } {
  if (s.kind !== 'sequence' || fitnessPhase(s, now) !== 'active') return { session: s, outcome: 'not_active' };
  if (n !== s.nextNumber) return { session: s, outcome: 'wrong' };
  if (n < SEQUENCE_LENGTH) return { session: { ...s, nextNumber: n + 1 }, outcome: 'counted' };
  const reps = s.reps + 1;
  const done = reps >= s.target;
  return {
    session: {
      ...s,
      reps,
      lastRepAt: now,
      nextNumber: 1,
      grid: done ? s.grid : shuffledGrid(s.seed, reps),
      completedAt: done ? now : null,
    },
    outcome: 'counted',
  };
}

/** Timed: active time so far, in ms (pauses excluded). */
export function elapsedMs(s: FitnessSession, now: number): number {
  const from = activeFrom(s);
  if (from === null) return 0;
  const end = s.completedAt ?? now;
  const paused = s.pausedMs + (s.pausedAt !== null ? end - s.pausedAt : 0);
  return Math.min(s.target * 1000, Math.max(0, end - from - paused));
}

export function remainingMs(s: FitnessSession, now: number): number {
  return Math.max(0, s.target * 1000 - elapsedMs(s, now));
}

/** Timed with guidance (breathing, grounding): the cue to show now, or null. */
export function currentCue(s: FitnessSession, now: number): string | null {
  const { cues, cueEveryMs } = EXERCISES[s.config.exercise];
  if (!cues || !cueEveryMs || s.kind !== 'timed') return null;
  return cues[Math.floor(elapsedMs(s, now) / cueEveryMs) % cues.length];
}

export function pauseFitness(s: FitnessSession, now: number): FitnessSession {
  if (s.kind !== 'timed' || s.pausedAt !== null || fitnessPhase(s, now) !== 'active') return s;
  return { ...s, pausedAt: now };
}

export function resumeFitness(s: FitnessSession, now: number): FitnessSession {
  if (s.pausedAt === null) return s;
  return { ...s, pausedAt: null, pausedMs: s.pausedMs + (now - s.pausedAt) };
}

/**
 * Timed: completes the session once enough active time has passed. The
 * completion time is exact (when the target was reached), even if this is
 * called late.
 */
export function tickFitness(s: FitnessSession, now: number): FitnessSession {
  if (s.kind !== 'timed' || s.completedAt !== null || s.pausedAt !== null) return s;
  const from = activeFrom(s);
  if (from === null || elapsedMs(s, now) < s.target * 1000) return s;
  return { ...s, completedAt: from + s.pausedMs + s.target * 1000 };
}

export function fitnessResult(s: FitnessSession): FitnessMissionResult | null {
  const from = activeFrom(s);
  if (s.completedAt === null || from === null) return null;
  return {
    type: 'fitness',
    exercise: s.config.exercise,
    difficulty: s.config.difficulty,
    kind: s.kind,
    target: s.target,
    achieved: s.kind === 'timed' ? s.target : s.reps,
    durationMs: Math.max(0, s.completedAt - from),
    verification: s.kind === 'sequence' ? 'task_checked' : 'self_reported',
  };
}
