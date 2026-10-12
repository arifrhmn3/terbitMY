import type { MissionDifficulty } from '@/features/missions/types';

import { FAITH_POLICY } from '../policy';
import type { ResolvedTrack } from './music/types';
import type { DailyReflection, PromptSet, ReflectionMissionResult } from './types';

/**
 * One guided Reflection / Meditation session, as pure state. Time comes from
 * timestamps (pauses excluded), never from screen ticks:
 *
 *   ready ─Start─► settle ─► prompt 1 ─► … ─► closing intention ─► done
 *
 * The steps only change the text on screen; the music is owned by the
 * session screen and plays continuously underneath, never restarting.
 */
export type ReflectionStepKind = 'settle' | 'prompt' | 'closing';

export type ReflectionStep = { kind: ReflectionStepKind; text: string; startsAtMs: number };

export type ReflectionPhase = 'ready' | 'active' | 'done';

export type ReflectionSession = {
  targetMs: number;
  steps: ReflectionStep[];
  startedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  completedAt: number | null;
};

export function reflectionDurationMs(difficulty: MissionDifficulty): number {
  return FAITH_POLICY.reflection.durationSec[difficulty] * 1000;
}

/** Lays the prompts out across the session: settle, evenly spaced prompts, closing intention. */
export function createReflectionSession(prompts: PromptSet, difficulty: MissionDifficulty, targetMs = reflectionDurationMs(difficulty)) {
  const { settlingShare, closingShare, promptCount } = FAITH_POLICY.reflection;
  const shown = prompts.prompts.slice(0, promptCount[difficulty]);
  const settleMs = Math.round(targetMs * settlingShare);
  const closingAt = Math.round(targetMs * (1 - closingShare));
  const each = (closingAt - settleMs) / Math.max(1, shown.length);
  const steps: ReflectionStep[] = [
    { kind: 'settle', text: prompts.settle, startsAtMs: 0 },
    ...shown.map((text, i) => ({ kind: 'prompt' as const, text, startsAtMs: Math.round(settleMs + i * each) })),
    { kind: 'closing', text: prompts.closing, startsAtMs: closingAt },
  ];
  const session: ReflectionSession = { targetMs, steps, startedAt: null, pausedAt: null, pausedMs: 0, completedAt: null };
  return session;
}

export function reflectionPhase(s: ReflectionSession): ReflectionPhase {
  if (s.completedAt !== null) return 'done';
  return s.startedAt === null ? 'ready' : 'active';
}

export function startReflection(s: ReflectionSession, now: number): ReflectionSession {
  return s.startedAt === null ? { ...s, startedAt: now } : s;
}

/** Time spent in the session so far, pauses excluded (capped at the target). */
export function reflectionElapsedMs(s: ReflectionSession, now: number): number {
  if (s.startedAt === null) return 0;
  const end = s.completedAt ?? now;
  const paused = s.pausedMs + (s.pausedAt !== null ? end - s.pausedAt : 0);
  return Math.min(s.targetMs, Math.max(0, end - s.startedAt - paused));
}

export function reflectionRemainingMs(s: ReflectionSession, now: number): number {
  return Math.max(0, s.targetMs - reflectionElapsedMs(s, now));
}

/** Index of the step on screen now. */
export function currentStepIndex(s: ReflectionSession, now: number): number {
  const elapsed = reflectionElapsedMs(s, now);
  let index = 0;
  s.steps.forEach((step, i) => {
    if (elapsed >= step.startsAtMs) index = i;
  });
  return index;
}

export function pauseReflection(s: ReflectionSession, now: number): ReflectionSession {
  if (reflectionPhase(s) !== 'active' || s.pausedAt !== null) return s;
  return { ...s, pausedAt: now };
}

export function resumeReflection(s: ReflectionSession, now: number): ReflectionSession {
  if (s.pausedAt === null) return s;
  return { ...s, pausedAt: null, pausedMs: s.pausedMs + (now - s.pausedAt) };
}

/** Completes the session once its time is up. The completion time is exact even if called late. */
export function tickReflection(s: ReflectionSession, now: number): ReflectionSession {
  if (s.startedAt === null || s.completedAt !== null || s.pausedAt !== null) return s;
  if (reflectionElapsedMs(s, now) < s.targetMs) return s;
  return { ...s, completedAt: s.startedAt + s.pausedMs + s.targetMs };
}

export function reflectionResult(
  s: ReflectionSession,
  daily: DailyReflection,
  prompts: PromptSet,
  difficulty: MissionDifficulty,
  music: ResolvedTrack | null,
): ReflectionMissionResult | null {
  if (s.completedAt === null || s.startedAt === null) return null;
  return {
    type: 'reflection',
    difficulty,
    date: daily.date,
    theme: prompts.theme,
    promptSetId: prompts.id,
    trackId: music?.track.id ?? daily.trackId,
    trackTitle: music?.track.title ?? '',
    musicSource: music?.kind ?? 'fallback',
    targetMs: s.targetMs,
    durationMs: reflectionElapsedMs(s, s.completedAt),
  };
}
