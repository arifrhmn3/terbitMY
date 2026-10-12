import type { DayKey } from '@/features/progress/day';

import { addDays, type ScheduleLayers } from '../schedule';
import type { TrackId } from './music/types';
import { dailyReflection, type ReflectionDayValue } from './schedule';
import type { DailyReflection } from './types';

/** Reflection sessions started today (saved on the phone only, never synced or shown as history). */
export const REFLECTION_SESSIONS_KEY = 'faith.reflectionSessions';

/** How far back the pool of earlier scheduled Reflections reaches when choosing a fresh session. */
export const ALTERNATE_LOOKBACK_DAYS = 28;

export type ReflectionChoice = { promptSetId: string; trackId: TrackId };
export type ReflectionSessionLog = { date: DayKey; started: ReflectionChoice[] };

/** A session to run today: today's canonical Reflection, or a fresh alternate for a later session. */
export type ReflectionPick = DailyReflection & { alternate: boolean };

export function startedOn(log: ReflectionSessionLog | null, date: DayKey): ReflectionChoice[] {
  return log?.date === date ? log.started : [];
}

export function logSessionStart(log: ReflectionSessionLog | null, date: DayKey, choice: ReflectionChoice): ReflectionSessionLog {
  return { date, started: [...startedOn(log, date), choice] };
}

/**
 * The first session of the day is today's canonical Reflection. Each later
 * one is a fresh session for today, drawn from earlier scheduled Reflections:
 * prompt sets not used today first (least recently used otherwise), then a
 * different track from the last session, then the nearest earlier day.
 * Deterministic: the same sessions on the same day give the same choice.
 */
export function pickReflection(
  layers: ScheduleLayers<ReflectionDayValue>,
  date: DayKey,
  started: readonly ReflectionChoice[],
): ReflectionPick {
  const canonical = dailyReflection(layers, date);
  if (started.length === 0) return { ...canonical, alternate: false };

  // Today's canonical session always counts as used.
  const used: ReflectionChoice[] = [canonical, ...started];
  const lastUse = (promptSetId: string) => used.map((c) => c.promptSetId).lastIndexOf(promptSetId);
  const lastTrack = used[used.length - 1].trackId;

  const pool: { value: DailyReflection; daysBack: number }[] = [];
  for (let k = 1; k <= ALTERNATE_LOOKBACK_DAYS; k++) {
    const value = dailyReflection(layers, addDays(date, -k));
    if (!pool.some((p) => p.value.promptSetId === value.promptSetId)) pool.push({ value, daysBack: k });
  }
  if (pool.length === 0) return { ...canonical, alternate: false };

  const rank = (p: (typeof pool)[number]) => [lastUse(p.value.promptSetId), p.value.trackId === lastTrack ? 1 : 0, p.daysBack];
  const best = pool.reduce((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
    return a;
  });
  const { theme, promptSetId, trackId } = best.value;
  return { date, theme, promptSetId, trackId, alternate: true };
}
