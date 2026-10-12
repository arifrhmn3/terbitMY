import { daysBetween, type DayKey } from '@/features/progress/day';

/**
 * Terbit's daily schedules (Daily Recitation per tradition, Daily Reflection).
 * Terbit decides what every date gets; nothing is random per user, and no
 * provider "random" endpoint is ever used. Every phone computes the same
 * answer offline:
 *
 *   1. an explicit published entry for the date, else
 *   2. the rotation segment in force on that date (the latest segment whose
 *      `from` is on or before it): values[(days since `from`) mod length].
 */
export type ScheduleSegment<T> = { from: DayKey; values: readonly T[] };

export type DailySchedule<T> = {
  /** Increases with every published schedule (bundled with the app or downloaded later). */
  version: number;
  entries: readonly { date: DayKey; value: T }[];
  segments: readonly ScheduleSegment<T>[];
};

export function scheduledValue<T>(schedule: DailySchedule<T>, date: DayKey): T | null {
  const entry = schedule.entries.find((e) => e.date === date);
  if (entry) return entry.value;
  let segment: ScheduleSegment<T> | null = null;
  for (const s of schedule.segments) if (s.from <= date && (!segment || s.from >= segment.from)) segment = s;
  if (!segment || segment.values.length === 0) return null;
  const n = segment.values.length;
  return segment.values[((daysBetween(segment.from, date) % n) + n) % n];
}

/**
 * The schedule history on this phone. A newer schedule never replaces an
 * older one; it is added as a layer that only applies to dates AFTER its
 * `after` date. So once a date is past (or protected), its assignment can
 * never change, whatever is downloaded later.
 */
export type ScheduleLayers<T> = readonly { after: DayKey; schedule: DailySchedule<T> }[];

export function layersOf<T>(schedule: DailySchedule<T>): ScheduleLayers<T> {
  return [{ after: '0000-00-00', schedule }];
}

/** The value for `date`: from the newest layer that applies to it. */
export function valueOn<T>(layers: ScheduleLayers<T>, date: DayKey): T | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (date > layers[i].after) return scheduledValue(layers[i].schedule, date);
  }
  return null;
}

export function latestVersion<T>(layers: ScheduleLayers<T>): number {
  return layers.reduce((v, l) => Math.max(v, l.schedule.version), 0);
}

/** Today and tomorrow are protected too (tomorrow may already be prefetched for an early alarm). */
export const PROTECTED_DAYS_AHEAD = 1;

export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Adds a newer schedule. It applies only after today + PROTECTED_DAYS_AHEAD,
 * so past, today's and tomorrow's assignments never change. Older or
 * same-version schedules are ignored.
 */
export function applySchedule<T>(layers: ScheduleLayers<T>, incoming: DailySchedule<T>, today: DayKey): ScheduleLayers<T> {
  if (incoming.version <= latestVersion(layers)) return layers;
  return [...layers, { after: addDays(today, PROTECTED_DAYS_AHEAD), schedule: incoming }];
}
