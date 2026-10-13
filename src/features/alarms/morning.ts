import { WEEKDAY_ORDER, type Alarm, type AlarmDraft, type Weekday } from './alarm';
import type { RoutineContext } from './creation';
import { mainWakeUpOverlaps, type MainWakeUpOverlap } from './main-wake-up';

/**
 * PROTOTYPE MORNING WINDOW. The one place that decides which alarm times
 * count as "morning". Later the user sets their own during onboarding /
 * Morning Routine setup, and the Morning / Throughout the Day / Night step in
 * alarm creation will state the routine directly; then `routineContextFor`
 * reads that instead of the clock, and nothing else changes.
 */
export const MORNING_WINDOW = {
  /** Minutes after midnight, inclusive: 03:00. */
  startMinutes: 3 * 60,
  /** Minutes after midnight, exclusive: 11:00. */
  endMinutes: 11 * 60,
} as const;

export type MorningWindow = { startMinutes: number; endMinutes: number };

export function isInMorningWindow(time: { hour: number; minute: number }, window: MorningWindow = MORNING_WINDOW): boolean {
  const m = time.hour * 60 + time.minute;
  return m >= window.startMinutes && m < window.endMinutes;
}

/**
 * Which routine an alarm belongs to. For now it's inferred from the time
 * (only Morning matters yet); once alarms record an explicit routine, that
 * wins and this inference becomes the fallback for older alarms.
 */
export function routineContextFor(time: { hour: number; minute: number }, window: MorningWindow = MORNING_WINDOW): RoutineContext {
  return isInMorningWindow(time, window) ? 'morning' : 'day';
}

/**
 * What to ask before saving, under the rule "one Main Wake-Up per day"
 * (`main-wake-up.ts`):
 * - offer_main: a new morning alarm on days that have no Main Wake-Up yet;
 * - replace_days: its days already have a repeating Main Wake-Up;
 * - date_override: a one-off on a day a repeating Main Wake-Up covers;
 * - replace_date: a one-off on a date that already has a one-off Main Wake-Up.
 * `explicit`: the user turned Main Wake-Up on themselves (new or edited
 * alarm); otherwise it's a suggestion for a new morning alarm. Being the
 * first alarm never makes an alarm the Main Wake-Up by itself.
 */
export type MainWakeUpQuestion =
  | { kind: 'none' }
  | { kind: 'offer_main' }
  /** `deleting`: alarms left with no days (fully replaced), which are deleted on save. */
  | { kind: 'replace_days'; days: Weekday[]; current: Alarm[]; deleting: Alarm[]; explicit: boolean }
  | { kind: 'date_override'; weekday: Weekday; current: Alarm; explicit: boolean }
  | { kind: 'replace_date'; weekday: Weekday; current: Alarm; explicit: boolean };

const sameSchedule = (a: Pick<Alarm, 'hour' | 'minute' | 'weekdays'>, b: Pick<Alarm, 'hour' | 'minute' | 'weekdays'>) =>
  a.hour === b.hour && a.minute === b.minute && [...a.weekdays].sort().join() === [...b.weekdays].sort().join();

function questionFor(overlaps: MainWakeUpOverlap[], explicit: boolean): MainWakeUpQuestion {
  const days = overlaps.filter((o): o is Extract<MainWakeUpOverlap, { kind: 'days' }> => o.kind === 'days');
  if (days.length > 0) {
    return {
      kind: 'replace_days',
      days: WEEKDAY_ORDER.filter((d) => days.some((o) => o.days.includes(d))),
      current: days.map((o) => o.alarm),
      deleting: days.filter((o) => o.full).map((o) => o.alarm),
      explicit,
    };
  }
  const date = overlaps.find((o) => o.kind === 'same_date');
  if (date) return { kind: 'replace_date', weekday: date.weekday, current: date.alarm, explicit };
  const override = overlaps.find((o) => o.kind === 'date_override');
  if (override) return { kind: 'date_override', weekday: override.weekday, current: override.alarm, explicit };
  return { kind: 'none' };
}

export function mainWakeUpQuestion(
  draft: AlarmDraft,
  alarms: readonly Alarm[],
  options: { alarmId?: string; now: number; window?: MorningWindow },
): MainWakeUpQuestion {
  if (!draft.enabled) return { kind: 'none' };
  const existing = options.alarmId ? alarms.find((a) => a.id === options.alarmId) : undefined;
  const overlaps = mainWakeUpOverlaps(draft, alarms, options.alarmId, options.now);

  if (draft.isPrimary) {
    // Already the Main Wake-Up with the same days and time: nothing new to decide.
    if (existing?.isPrimary && existing.enabled && sameSchedule(existing, draft)) return { kind: 'none' };
    return questionFor(overlaps, true);
  }
  // Suggestions only for NEW alarms in the Morning window.
  if (options.alarmId || routineContextFor(draft, options.window) !== 'morning') return { kind: 'none' };
  return overlaps.length === 0 ? { kind: 'offer_main' } : questionFor(overlaps, false);
}

/** The user's answer. ('cancel' is handled by the screen: nothing is saved.) */
export type MainWakeUpChoice = 'use_as_main' | 'not_now' | 'replace' | 'keep_existing';

/**
 * Applies the answer to the alarm being saved:
 * - use_as_main / replace: it becomes a Main Wake-Up; on save, other Main
 *   Wake-Ups lose only the overlapping days, or are deleted if none are left
 *   (see `resolveMainWakeUpOverlaps`);
 * - keep_existing: a one-off morning alarm (rings once, then turns itself
 *   off; never the Main Wake-Up, so it never affects the streak);
 * - not_now: saved as it is, not the Main Wake-Up.
 */
export function applyMainWakeUpChoice(draft: AlarmDraft, choice: MainWakeUpChoice): AlarmDraft {
  switch (choice) {
    case 'use_as_main':
    case 'replace':
      return { ...draft, isPrimary: true };
    case 'keep_existing':
      return { ...draft, isPrimary: false, weekdays: [] };
    case 'not_now':
      return { ...draft, isPrimary: false };
  }
}

/** One-time alarms ring once and then turn themselves off; Today tags them "One-off". */
export function isOneOff(alarm: { weekdays: readonly number[] }): boolean {
  return alarm.weekdays.length === 0;
}
