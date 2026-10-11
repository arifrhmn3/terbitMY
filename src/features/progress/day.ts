/**
 * Calendar days for streaks. A morning belongs to the local calendar day its
 * alarm was due (`scheduledAt`), not when the mission was finished, so a
 * 23:50 alarm completed at 00:10 still counts for the day it rang.
 */

/** 'YYYY-MM-DD' for a moment in time. */
export type DayKey = string;
export type DayKeyFn = (time: number) => DayKey;

const pad = (n: number) => String(n).padStart(2, '0');

/** The phone's own time zone (follows the device setting, including daylight saving). */
export const localDayKey: DayKeyFn = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A fixed UTC offset, e.g. +480 for Malaysia (UTC+8). For tests and tools. */
export function dayKeyAtOffset(offsetMinutes: number): DayKeyFn {
  return (time) => {
    const d = new Date(time + offsetMinutes * 60_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
}

/** Whole calendar days from `a` to `b` (b − a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const toUtc = (key: DayKey) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}
