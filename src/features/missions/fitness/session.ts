import { EXERCISES, FITNESS_COUNTDOWN_MS, fitnessTarget } from './exercises';
import type { FitnessMissionConfig, FitnessMissionResult } from './types';

/**
 * One fitness mission, as pure state. Every function takes `now`, and all
 * progress is worked out from timestamps (never from screen ticks), so a
 * slow screen or the app going to the background can't distort the time.
 *
 *   ready ─Start─► countdown (3 s) ─► active ─target reached─► done
 *
 * Rep-based: each counted rep must be at least `minRepIntervalMs` after the
 * previous one. Timed: the timer runs from the end of the countdown and can
 * be paused. Abandoning is the alarm screen's existing "skip / give up".
 */
export type FitnessPhase = 'ready' | 'countdown' | 'active' | 'done';

export type FitnessSession = {
  config: FitnessMissionConfig;
  kind: 'reps' | 'timed';
  /** Reps, or seconds for timed exercises. */
  target: number;
  countdownMs: number;
  minRepIntervalMs: number;
  /** When Start was tapped (the countdown begins). */
  startedAt: number | null;
  reps: number;
  lastRepAt: number | null;
  /** Timed: when the current pause began, and the total paused before it. */
  pausedAt: number | null;
  pausedMs: number;
  completedAt: number | null;
};

export function createFitnessSession(config: FitnessMissionConfig): FitnessSession {
  const exercise = EXERCISES[config.exercise];
  return {
    config,
    kind: exercise.kind,
    target: fitnessTarget(config.exercise, config.difficulty),
    countdownMs: FITNESS_COUNTDOWN_MS,
    minRepIntervalMs: exercise.minRepIntervalMs ?? 0,
    startedAt: null,
    reps: 0,
    lastRepAt: null,
    pausedAt: null,
    pausedMs: 0,
    completedAt: null,
  };
}

/** When the exercise itself starts (after the countdown). */
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

export type RepOutcome = 'counted' | 'too_fast' | 'not_active';

/** Counts one rep if the exercise is active and the previous rep wasn't too recent. */
export function recordRep(s: FitnessSession, now: number): { session: FitnessSession; outcome: RepOutcome } {
  if (s.kind !== 'reps' || fitnessPhase(s, now) !== 'active') return { session: s, outcome: 'not_active' };
  if (s.lastRepAt !== null && now - s.lastRepAt < s.minRepIntervalMs) return { session: s, outcome: 'too_fast' };
  const reps = s.reps + 1;
  return {
    session: { ...s, reps, lastRepAt: now, completedAt: reps >= s.target ? now : null },
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
    achieved: s.kind === 'reps' ? s.reps : s.target,
    durationMs: Math.max(0, s.completedAt - from),
    verification: 'self_reported',
    adaptation: s.config.adaptation ?? 'standard',
  };
}
