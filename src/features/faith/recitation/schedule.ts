import type { DayKey } from '@/features/progress/day';

import { layersOf, valueOn, type DailySchedule, type ScheduleLayers } from '../schedule';
import { perTradition, type FaithTradition } from '../types';
import { DEV_REMOTE_PROVIDER_ID, devContentId } from './content';
import type { DailyRecitationAssignment } from './types';

/** What a date points at: a provider and that provider's stable content ID. */
export type RecitationRef = { provider: string; contentId: string };

export type RecitationScheduleSet = Record<FaithTradition, ScheduleLayers<RecitationRef>>;

const dev = (tradition: FaithTradition, letter: string): RecitationRef => ({
  provider: DEV_REMOTE_PROVIDER_ID,
  contentId: devContentId(tradition, letter),
});

/**
 * The DEVELOPMENT Daily Recitation schedule bundled with the app (version 1).
 * Each tradition has its own schedule. Real schedules will be published by
 * Terbit (bundled, later also downloaded from Supabase) once content and
 * reviewers are decided. Rules for publishing: never change a past date;
 * change rotations only by adding a segment that starts on a later date.
 */
const ROTATION_ORDER: Record<FaithTradition, readonly string[]> = {
  islam: ['A', 'B', 'C'],
  christianity: ['B', 'C', 'A'],
  buddhism: ['C', 'A', 'B'],
  hinduism: ['A', 'C', 'B'],
};

export const BUNDLED_RECITATION_SCHEDULE: Record<FaithTradition, DailySchedule<RecitationRef>> = perTradition((t) => ({
  version: 1,
  // An explicit entry, as Terbit will publish for special days.
  entries: [{ date: '2026-10-12', value: dev(t, 'B') }],
  segments: [{ from: '2026-01-01', values: ROTATION_ORDER[t].map((l) => dev(t, l)) }],
}));

export function initialRecitationSchedules(): RecitationScheduleSet {
  return perTradition((t) => layersOf(BUNDLED_RECITATION_SCHEDULE[t]));
}

export function assignmentId(tradition: FaithTradition, date: DayKey): string {
  return `daily-${tradition}-${date}`;
}

/** The canonical Daily Recitation for a tradition on a date (same for every user of that tradition). */
export function dailyRecitation(
  schedules: RecitationScheduleSet,
  tradition: FaithTradition,
  date: DayKey,
): DailyRecitationAssignment | null {
  const ref = valueOn(schedules[tradition], date);
  return ref ? { id: assignmentId(tradition, date), tradition, date, ...ref } : null;
}
