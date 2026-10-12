import type { DayKey } from '@/features/progress/day';

import { layersOf, valueOn, type DailySchedule, type ScheduleLayers } from '../schedule';
import { FALLBACK_TRACK_ID } from './music/catalogue';
import type { TrackId } from './music/types';
import type { DailyReflection, ReflectionTheme } from './types';

export type ReflectionDayValue = { theme: ReflectionTheme; promptSetId: string; trackId: TrackId };

const day = (theme: ReflectionTheme, promptSetId: string, trackId: TrackId): ReflectionDayValue => ({ theme, promptSetId, trackId });

/**
 * The DEVELOPMENT Daily Reflection schedule bundled with the app (version 1):
 * the same theme, prompts and track for every user on a local date. The
 * music is universal (not tied to religion). Same publishing rules as the
 * Recitation schedule: never change a past date.
 */
export const BUNDLED_REFLECTION_SCHEDULE: DailySchedule<ReflectionDayValue> = {
  version: 1,
  entries: [{ date: '2026-10-12', value: day('gratitude', 'gratitude-1', 'reflection-001') }],
  segments: [
    {
      from: '2026-01-01',
      values: [
        day('gratitude', 'gratitude-1', 'reflection-001'),
        day('intention', 'intention-1', 'reflection-002'),
        day('calm', 'calm-1', 'reflection-003'),
        day('patience', 'patience-1', 'reflection-001'),
        day('mindfulness', 'mindfulness-1', 'reflection-002'),
        day('perspective', 'perspective-1', 'reflection-003'),
        day('compassion', 'compassion-1', 'reflection-001'),
        day('spiritual_reflection', 'spiritual-reflection-1', 'reflection-002'),
      ],
    },
  ],
};

export function initialReflectionSchedule(): ScheduleLayers<ReflectionDayValue> {
  return layersOf(BUNDLED_REFLECTION_SCHEDULE);
}

/** Today's (or a past date's) Reflection. If no schedule covers the date, a calm default with the fallback track. */
export function dailyReflection(layers: ScheduleLayers<ReflectionDayValue>, date: DayKey): DailyReflection {
  const value = valueOn(layers, date) ?? day('calm', 'calm-1', FALLBACK_TRACK_ID);
  return { date, ...value };
}
