import type { Alarm } from '@/features/alarms/alarm';
import { ALARM_DEFAULTS } from '@/features/alarms/alarm-defaults';
import { MISSION_CATEGORIES } from '@/features/alarms/creation';
import { resolvedMainWakeUp } from '@/features/alarms/main-wake-up';
import type { FaithPreference } from '@/features/faith/types';
import type { MobilityProfile } from '@/features/missions/fitness/types';
import { NIGHT_ROUTINE_DEFAULTS, type ClockTime, type NightRoutine } from '@/features/night/night-routine';

import { validGoal } from './recommend';
import type { DayPart, Goals, PersonalisationAnswers, SleepAnswer, WakeAnswer } from './types';

/**
 * Safe defaults for anything the user skips. They come from the app's own
 * central defaults (ALARM_DEFAULTS, NIGHT_ROUTINE_DEFAULTS), never from
 * guesses about the person: a skipped answer never invents a private trait.
 */
export const PERSONALISATION_DEFAULTS = {
  mode: ALARM_DEFAULTS.completionMode,
  /** A goal whose time-of-day step was skipped is held at the start of the day (with the Main Wake-Up). */
  part: 'morning' as DayPart,
  wake: { hour: ALARM_DEFAULTS.hour, minute: ALARM_DEFAULTS.minute } as ClockTime,
  weekendTime: { hour: 8, minute: 0 } as ClockTime,
  snooze: { ...ALARM_DEFAULTS.snooze },
  sleep: { windDown: { ...NIGHT_ROUTINE_DEFAULTS.windDown }, bedtime: { ...NIGHT_ROUTINE_DEFAULTS.bedtime } } as SleepAnswer,
} as const;

export const NO_GOALS: Goals = { education: null, fitness: null, faith: null };

/** The next date (from `now`) falling on this weekday, at noon. */
function nextWeekday(now: number, weekday: number): number {
  const d = new Date(now);
  const offset = (weekday - d.getDay() + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12, 0).getTime();
}

const clockOf = (a: Pick<Alarm, 'hour' | 'minute'>): ClockTime => ({ hour: a.hour, minute: a.minute });

/**
 * The wake-up answers as the phone is set up right now: the Main Wake-Up
 * that applies next Monday and next Saturday (through the central resolver),
 * and the weekday one's snooze. Without a Main Wake-Up, the defaults.
 */
export function currentWake(alarms: readonly Alarm[], now: number): WakeAnswer {
  const weekday = resolvedMainWakeUp(alarms, nextWeekday(now, 1));
  const weekend = resolvedMainWakeUp(alarms, nextWeekday(now, 6));
  const weekdayTime = weekday ? clockOf(weekday) : { ...PERSONALISATION_DEFAULTS.wake };
  const snooze = weekday ? { ...weekday.snooze } : { ...PERSONALISATION_DEFAULTS.snooze };
  if (!weekday) return { weekday: weekdayTime, weekend: 'same', weekendTime: { ...PERSONALISATION_DEFAULTS.weekendTime }, snooze };
  if (!weekend) return { weekday: weekdayTime, weekend: 'off', weekendTime: { ...PERSONALISATION_DEFAULTS.weekendTime }, snooze };
  const same = weekend.id === weekday.id || (weekend.hour === weekday.hour && weekend.minute === weekday.minute);
  return { weekday: weekdayTime, weekend: same ? 'same' : 'different', weekendTime: clockOf(weekend), snooze };
}

/** The Night Routine's times as sleep targets, or the defaults. */
export function currentSleep(night: NightRoutine | null): SleepAnswer {
  return night ? { windDown: { ...night.windDown }, bedtime: { ...night.bedtime } } : { ...PERSONALISATION_DEFAULTS.sleep };
}

/**
 * Where a (re)run of personalisation starts: what the phone already has
 * (Faith, Mobility, Main Wake-Up, Night Routine) plus the goals saved by an
 * earlier personalisation, if any. Skipping a step returns to these values,
 * so a skipped step never changes the user's setup.
 */
export function baselineAnswers(params: {
  alarms: readonly Alarm[];
  night: NightRoutine | null;
  faith: FaithPreference | null;
  mobilityProfile: MobilityProfile;
  saved?: { gender: PersonalisationAnswers['gender']; goals: Goals; sleep?: SleepAnswer | null } | null;
  now: number;
}): PersonalisationAnswers {
  const { alarms, night, faith, mobilityProfile, saved, now } = params;
  const context = { faith, mobilityProfile };
  const goals: Goals = { ...NO_GOALS };
  for (const category of MISSION_CATEGORIES) {
    const answer = saved?.goals[category];
    if (answer) goals[category] = { ...answer, goal: validGoal(category, answer.goal, context) } as never;
  }
  return {
    gender: saved?.gender ?? null,
    faith,
    mobilityProfile,
    goals,
    wake: currentWake(alarms, now),
    // Saved sleep targets first; otherwise the Night Routine's times, or the defaults.
    sleep: saved?.sleep ? { ...saved.sleep } : currentSleep(night),
    // Adding or updating a Night Routine is always an explicit choice.
    nightRoutine: false,
  };
}
