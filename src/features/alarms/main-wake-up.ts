import { localDayKey, type DayKey } from '@/features/progress/day';

import { nextOccurrence, WEEKDAY_ORDER, type Alarm, type Weekday } from './alarm';
import type { AlarmOccurrence } from './occurrence';

/**
 * THE MAIN WAKE-UP RULE: at most ONE Main Wake-Up applies to any calendar
 * day. Several alarms may be Main Wake-Ups (e.g. Mon–Fri 06:30 and Sat–Sun
 * 08:00), as long as their days don't overlap. A one-off Main Wake-Up is a
 * date override: it is that date's Main Wake-Up, and the repeating schedule
 * stays as it is for every other week.
 *
 * `resolvedMainWakeUp` is the single answer to "which alarm is the Main
 * Wake-Up on this date?". Today, the weekly schedule, the morning snapshot
 * recorded when an alarm rings (and so streaks), simulate, and snooze
 * ownership all ask it; nothing else decides.
 */

/** The words every screen uses for these tags. */
export const MAIN_WAKE_UP_TAG = 'Main Wake-Up';
export const ONE_OFF_TAG = 'One-off';

export const DAY_NAME: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

type Scheduled = Pick<Alarm, 'hour' | 'minute' | 'weekdays' | 'enabled'> & { updatedAt?: number };

/**
 * When a one-off alarm rings: the next time its clock time comes round after
 * it was saved (stable however late the app checks; turning itself off after
 * ringing keeps `updatedAt`, so this never moves).
 */
export function oneOffRingAt(alarm: Scheduled, now: number): number {
  const from = new Date(alarm.updatedAt ?? now);
  return (nextOccurrence({ ...alarm, enabled: true } as Alarm, from) ?? from).getTime();
}

/** A one-off whose ring time has passed: it no longer belongs to any future schedule. */
export function isExpiredOneOff(alarm: Scheduled, now: number): boolean {
  return alarm.weekdays.length === 0 && oneOffRingAt(alarm, now) <= now;
}

/** Saved, turned on, and still to ring (repeating, or a one-off that hasn't rung yet). */
export function isActiveAlarm(alarm: Scheduled, now: number): boolean {
  return alarm.enabled && !isExpiredOneOff(alarm, now);
}

/** Which days an alarm covers: weekdays (repeating), or one date (one-off). */
export type MainCoverage = { kind: 'weekly'; days: Weekday[] } | { kind: 'date'; date: DayKey; weekday: Weekday };

export function coverageOf(alarm: Scheduled, now: number): MainCoverage {
  if (alarm.weekdays.length > 0) return { kind: 'weekly', days: [...alarm.weekdays] };
  const ring = new Date(oneOffRingAt(alarm, now));
  return { kind: 'date', date: localDayKey(ring.getTime()), weekday: ring.getDay() as Weekday };
}

/** Whether the alarm rings on the calendar day containing `time` (ignores on/off). */
export function ringsOnDate(alarm: Scheduled, time: number): boolean {
  if (alarm.weekdays.length > 0) return alarm.weekdays.includes(new Date(time).getDay() as Weekday);
  const c = coverageOf(alarm, time);
  return c.kind === 'date' && c.date === localDayKey(time);
}

/** The next time the alarm rings after `now`, or null (off, deleted, or a one-off that already rang). */
export function nextRingAt(alarm: Alarm, now: number): number | null {
  if (!alarm.enabled) return null;
  if (alarm.weekdays.length === 0) {
    const at = oneOffRingAt(alarm, now);
    return at > now ? at : null;
  }
  return nextOccurrence(alarm, new Date(now))?.getTime() ?? null;
}

/** Newer choices win; ties are settled by id so the answer is always the same. */
const newestFirst = (a: Alarm, b: Alarm) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

/**
 * THE Main Wake-Up for the calendar day containing `time` (0 or 1 alarm):
 * 1. a one-off Main Wake-Up on that date (a date override), while it's on,
 *    or after it rang and turned itself off (`recorded`: that date's mornings);
 * 2. otherwise the enabled repeating Main Wake-Up covering that weekday (if
 *    older data has several, the most recently saved; see `legacyMainWakeUpFixes`).
 */
export function resolvedMainWakeUp(
  alarms: readonly Alarm[],
  time: number,
  recorded: readonly Pick<AlarmOccurrence, 'alarmId' | 'scheduledAt' | 'isMainWakeUp'>[] = [],
): Alarm | null {
  const day = localDayKey(time);
  const rang = (a: Alarm) => recorded.some((o) => o.alarmId === a.id && o.isMainWakeUp && localDayKey(o.scheduledAt) === day);
  const override = alarms
    .filter((a) => a.isPrimary && a.weekdays.length === 0 && (a.enabled || rang(a)) && ringsOnDate(a, time))
    .sort(newestFirst)[0];
  if (override) return override;
  return alarms.filter((a) => a.isPrimary && a.enabled && ringsOnDate(a, time)).sort(newestFirst)[0] ?? null;
}

/** The id of `resolvedMainWakeUp`, or null. */
export function mainWakeUpIdForDate(
  alarms: readonly Alarm[],
  time: number,
  recorded?: readonly Pick<AlarmOccurrence, 'alarmId' | 'scheduledAt' | 'isMainWakeUp'>[],
): string | null {
  return resolvedMainWakeUp(alarms, time, recorded)?.id ?? null;
}

/** An existing Main Wake-Up that a new or edited Main Wake-Up would collide with. */
export type MainWakeUpOverlap =
  /** Repeating vs repeating: these days already have it. `full`: all of its days. */
  | { kind: 'days'; alarm: Alarm; days: Weekday[]; full: boolean }
  /** A one-off on a day a repeating Main Wake-Up covers: use it for that date only. */
  | { kind: 'date_override'; alarm: Alarm; date: DayKey; weekday: Weekday }
  /** Two one-offs on the same date. */
  | { kind: 'same_date'; alarm: Alarm; date: DayKey; weekday: Weekday };

/**
 * Where `candidate`, as a Main Wake-Up, would collide with the other enabled
 * Main Wake-Ups. A repeating alarm never collides with a one-off: the one-off
 * simply overrides that one date.
 */
export function mainWakeUpOverlaps(candidate: Scheduled, alarms: readonly Alarm[], selfId: string | undefined, now: number): MainWakeUpOverlap[] {
  const mine = coverageOf(candidate, now);
  const overlaps: MainWakeUpOverlap[] = [];
  for (const other of alarms) {
    if (other.id === selfId || !other.isPrimary || !other.enabled) continue;
    const theirs = coverageOf(other, now);
    if (mine.kind === 'weekly' && theirs.kind === 'weekly') {
      const days = WEEKDAY_ORDER.filter((d) => mine.days.includes(d) && theirs.days.includes(d));
      if (days.length > 0) overlaps.push({ kind: 'days', alarm: other, days, full: days.length === theirs.days.length });
    } else if (mine.kind === 'date' && theirs.kind === 'weekly') {
      if (theirs.days.includes(mine.weekday)) overlaps.push({ kind: 'date_override', alarm: other, date: mine.date, weekday: mine.weekday });
    } else if (mine.kind === 'date' && theirs.kind === 'date' && mine.date === theirs.date) {
      overlaps.push({ kind: 'same_date', alarm: other, date: mine.date, weekday: mine.weekday });
    }
  }
  return overlaps;
}

/** What replacing does to the other alarms: some keep fewer days, some are deleted. */
export type MainWakeUpReplacement = { update: Alarm[]; remove: Alarm[] };

/**
 * When the candidate takes over (the user confirmed "Replace"):
 * - partial day overlap: the old Main Wake-Up loses only the overlapping
 *   days and keeps the rest (several partial overlaps: each loses its own);
 * - full day overlap: the old alarm is DELETED (it would have no days left);
 * - same-date one-off: the old one-off is deleted;
 * - date override: nothing changes (the repeating schedule stays intact).
 * Deleting never touches history: past mornings, XP, streaks and
 * achievements keep their own records (see `alarmStore.remove`).
 */
export function resolveMainWakeUpOverlaps(overlaps: readonly MainWakeUpOverlap[]): MainWakeUpReplacement {
  const update: Alarm[] = [];
  const remove: Alarm[] = [];
  for (const o of overlaps) {
    if (o.kind === 'days') {
      if (o.full) remove.push(o.alarm);
      else update.push({ ...o.alarm, weekdays: o.alarm.weekdays.filter((d) => !o.days.includes(d)) });
    } else if (o.kind === 'same_date') {
      remove.push(o.alarm);
    }
  }
  return { update, remove };
}

/**
 * Older builds could save repeating Main Wake-Ups whose days overlap. This
 * makes them follow the rule without deleting anything: the most recently
 * saved one keeps the shared days; an older one loses only those days, or,
 * if it would have none left, stays as an ordinary (non-Main) alarm with its
 * days and on/off state unchanged. Safe to run every time alarms load (no
 * overlaps → no changes). Past mornings are never touched.
 */
export function legacyMainWakeUpFixes(alarms: readonly Alarm[]): Alarm[] {
  const fixed = new Map<string, Alarm>();
  const claimed = new Set<Weekday>();
  const mains = alarms.filter((a) => a.isPrimary && a.enabled && a.weekdays.length > 0).sort(newestFirst);
  for (const alarm of mains) {
    const keep = alarm.weekdays.filter((d) => !claimed.has(d));
    if (keep.length === 0) fixed.set(alarm.id, { ...alarm, isPrimary: false });
    else if (keep.length < alarm.weekdays.length) fixed.set(alarm.id, { ...alarm, weekdays: keep });
    keep.forEach((d) => claimed.add(d));
  }
  // Two one-off Main Wake-Ups on the same date: the newer keeps it.
  const dates = new Set<DayKey>();
  for (const alarm of alarms.filter((a) => a.isPrimary && a.enabled && a.weekdays.length === 0).sort(newestFirst)) {
    const c = coverageOf(alarm, alarm.updatedAt);
    if (c.kind !== 'date') continue;
    if (dates.has(c.date)) fixed.set(alarm.id, { ...alarm, isPrimary: false });
    dates.add(c.date);
  }
  return [...fixed.values()];
}

/** "Wednesday", "Monday and Tuesday", "Monday–Friday", "Monday, Tuesday and Friday". */
export function describeDays(days: readonly Weekday[]): string {
  const ordered = WEEKDAY_ORDER.filter((d) => days.includes(d));
  const positions = ordered.map((d) => WEEKDAY_ORDER.indexOf(d));
  const consecutive = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
  if (ordered.length >= 3 && consecutive) return `${DAY_NAME[ordered[0]]}–${DAY_NAME[ordered[ordered.length - 1]]}`;
  const names = ordered.map((d) => DAY_NAME[d]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
