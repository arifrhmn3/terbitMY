import type { Alarm, Weekday } from '@/features/alarms/alarm';
import { resolvedMainWakeUp } from '@/features/alarms/main-wake-up';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { localDayKey, type DayKey } from '@/features/progress/day';

import { MIN_RESTRICTION_MINUTES, restrictionStartTime, restrictsApps, type ClockTime, type NightRoutine } from './night-routine';

/**
 * THE NIGHT TIME RULES (local calendar time, like the Main Wake-Up):
 * - a night belongs to the EVENING it starts (its weekday is that day's);
 * - 12:00–23:59 is that evening; 00:00–11:59 is the early morning after it;
 * - restrictions start at WIND-DOWN (`restrictionStartTime`), before bedtime;
 * - restrictions end at the next morning's Main Wake-Up (`resolvedMainWakeUp`
 *   for the morning after the evening), or at the routine's fallback morning
 *   time if that morning has none (or the routine says "fixed time").
 * Pure. Dates are built with local calendar arithmetic, so daylight saving
 * changes keep the clock times (as the native schedule does).
 */

type Recorded = readonly Pick<AlarmOccurrence, 'alarmId' | 'scheduledAt' | 'isMainWakeUp'>[];

const MIN = 60_000;

/** The calendar day (local midnight) containing `time`, `offset` days later. */
function dayStart(time: number, offset = 0): Date {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

/** A night clock time on the night that starts on `evening`. */
export function atNight(evening: Date, time: ClockTime): number {
  const after = time.hour < 12 ? 1 : 0;
  return new Date(evening.getFullYear(), evening.getMonth(), evening.getDate() + after, time.hour, time.minute).getTime();
}

export type RestrictionEndSource = 'main_wake_up' | 'fallback' | 'fixed_time';

export type NightWindow = {
  /** The evening this night starts (local calendar day). */
  evening: DayKey;
  weekday: Weekday;
  windDownAt: number;
  bedtimeAt: number;
  /** Always `windDownAt`: restrictions start at wind-down. */
  restrictionStartAt: number;
  restrictionEndAt: number;
  endSource: RestrictionEndSource;
  /** The next morning's Main Wake-Up, or null: "no wake alarm scheduled for tomorrow". */
  mainWakeUp: { alarmId: string; at: number } | null;
  /** Whether apps are restricted this night. */
  restricts: boolean;
};

export function appliesOnEvening(routine: Pick<NightRoutine, 'enabled' | 'weekdays'>, evening: Date): boolean {
  return routine.enabled && routine.weekdays.includes(evening.getDay() as Weekday);
}

/**
 * THE END-OF-RESTRICTION POLICY: the next morning's Main Wake-Up; otherwise
 * the fallback morning time. Never less than 15 minutes after the start.
 */
export function restrictionEnd(
  routine: Pick<NightRoutine, 'endRule' | 'fallbackEnd' | 'windDown'>,
  alarms: readonly Alarm[],
  evening: Date,
  recorded: Recorded = [],
): { at: number; source: RestrictionEndSource; mainWakeUp: NightWindow['mainWakeUp'] } {
  const morning = new Date(evening.getFullYear(), evening.getMonth(), evening.getDate() + 1);
  const start = atNight(evening, restrictionStartTime(routine));
  const main = resolvedMainWakeUp(alarms, morning.getTime() + 12 * 60 * MIN - 1, recorded);
  const mainAt = main ? new Date(morning.getFullYear(), morning.getMonth(), morning.getDate(), main.hour, main.minute).getTime() : null;
  const mainWakeUp = main && mainAt !== null ? { alarmId: main.id, at: mainAt } : null;
  if (routine.endRule === 'main_wake_up' && mainAt !== null && mainAt - start >= MIN_RESTRICTION_MINUTES * MIN) {
    return { at: mainAt, source: 'main_wake_up', mainWakeUp };
  }
  const fallback = atNight(evening, routine.fallbackEnd);
  return {
    at: Math.max(fallback, start + MIN_RESTRICTION_MINUTES * MIN),
    source: routine.endRule === 'fixed_time' ? 'fixed_time' : 'fallback',
    mainWakeUp,
  };
}

/** The night starting on the evening containing `eveningTime` (whether or not the routine applies). */
export function nightWindow(routine: NightRoutine, alarms: readonly Alarm[], eveningTime: number, recorded: Recorded = []): NightWindow {
  const evening = dayStart(eveningTime);
  const end = restrictionEnd(routine, alarms, evening, recorded);
  return {
    evening: localDayKey(evening.getTime()),
    weekday: evening.getDay() as Weekday,
    windDownAt: atNight(evening, routine.windDown),
    bedtimeAt: atNight(evening, routine.bedtime),
    restrictionStartAt: atNight(evening, restrictionStartTime(routine)),
    restrictionEndAt: end.at,
    endSource: end.source,
    mainWakeUp: end.mainWakeUp,
    restricts: restrictsApps(routine),
  };
}

/**
 * The night that matters now: last night if it's still going (e.g. 01:00, or
 * 06:00 before the Main Wake-Up), otherwise tonight. Null if neither applies
 * (the routine is off, or tonight isn't one of its nights).
 */
export function currentNight(routine: NightRoutine, alarms: readonly Alarm[], now: number, recorded: Recorded = []): NightWindow | null {
  const yesterday = dayStart(now, -1);
  if (appliesOnEvening(routine, yesterday)) {
    const last = nightWindow(routine, alarms, yesterday.getTime(), recorded);
    if (now < Math.max(last.restrictionEndAt, last.bedtimeAt)) return last;
  }
  const today = dayStart(now);
  return appliesOnEvening(routine, today) ? nightWindow(routine, alarms, today.getTime(), recorded) : null;
}

/** The next evening (from today, up to a week ahead) the routine applies to, or null. */
export function nextNight(routine: NightRoutine, alarms: readonly Alarm[], now: number): NightWindow | null {
  for (let offset = 0; offset <= 7; offset++) {
    const evening = dayStart(now, offset);
    if (!appliesOnEvening(routine, evening)) continue;
    const night = nightWindow(routine, alarms, evening.getTime());
    if (night.restrictionEndAt > now) return night;
  }
  return null;
}

/** A user's deliberate "end tonight's restrictions", until this time (ms). */
export type RestrictionOverride = { until: number } | null;

export type RestrictionState =
  /** No Night Routine, it's off, or no apps are chosen / restricting is off. */
  | { kind: 'inactive' }
  /** Restrictions are set up but Screen Time can't be used in this build or on this phone. */
  | { kind: 'unavailable' }
  | { kind: 'scheduled'; startsAt: number; endsAt: number }
  | { kind: 'active'; endsAt: number }
  /** Ended early tonight by the user; normal again from the next night. */
  | { kind: 'overridden'; endsAt: number }
  /** Last night's restrictions ended this morning. */
  | { kind: 'ended'; endedAt: number; nextStartsAt: number | null };

export function restrictionState(params: {
  routine: NightRoutine | null;
  alarms: readonly Alarm[];
  now: number;
  /** Screen Time is authorised and included in this build. */
  available: boolean;
  override?: RestrictionOverride;
  recorded?: Recorded;
}): RestrictionState {
  const { routine, alarms, now, available, override = null, recorded = [] } = params;
  if (!routine || !routine.enabled || !restrictsApps(routine)) return { kind: 'inactive' };
  if (!available) return { kind: 'unavailable' };

  for (const offset of [-1, 0]) {
    const evening = dayStart(now, offset);
    if (!appliesOnEvening(routine, evening)) continue;
    const w = nightWindow(routine, alarms, evening.getTime(), recorded);
    if (now >= w.restrictionStartAt && now < w.restrictionEndAt) {
      return override && override.until > now ? { kind: 'overridden', endsAt: w.restrictionEndAt } : { kind: 'active', endsAt: w.restrictionEndAt };
    }
  }
  const next = nextNight(routine, alarms, now);
  const yesterday = dayStart(now, -1);
  if (appliesOnEvening(routine, yesterday) && new Date(now).getHours() < 12) {
    const last = nightWindow(routine, alarms, yesterday.getTime(), recorded);
    if (last.restrictionEndAt <= now) return { kind: 'ended', endedAt: last.restrictionEndAt, nextStartsAt: next?.restrictionStartAt ?? null };
  }
  return next ? { kind: 'scheduled', startsAt: next.restrictionStartAt, endsAt: next.restrictionEndAt } : { kind: 'inactive' };
}

/**
 * One row of "Tonight" on Today, in time order. Restrictions aren't a row of
 * their own: they begin on the wind-down row and end on the Main Wake-Up row
 * (or on a "Restrictions end" row when they end at the fallback time).
 */
export type TonightItem =
  | { kind: 'wind_down'; at: number; restrictsApps: boolean }
  | { kind: 'bedtime'; at: number }
  | { kind: 'main_wake_up'; at: number; alarmId: string; endsRestrictions: boolean }
  | { kind: 'restrictions_end'; at: number }
  | { kind: 'no_main_wake_up' };

const ORDER: Record<TonightItem['kind'], number> = { wind_down: 0, bedtime: 1, restrictions_end: 2, main_wake_up: 3, no_main_wake_up: 4 };

export function tonightItems(night: NightWindow): TonightItem[] {
  const endsAtWakeUp = night.restricts && night.mainWakeUp !== null && night.mainWakeUp.at === night.restrictionEndAt;
  const items: TonightItem[] = [
    { kind: 'wind_down', at: night.windDownAt, restrictsApps: night.restricts },
    { kind: 'bedtime', at: night.bedtimeAt },
  ];
  if (night.restricts && !endsAtWakeUp) items.push({ kind: 'restrictions_end', at: night.restrictionEndAt });
  items.push(
    night.mainWakeUp
      ? { kind: 'main_wake_up', at: night.mainWakeUp.at, alarmId: night.mainWakeUp.alarmId, endsRestrictions: endsAtWakeUp }
      : { kind: 'no_main_wake_up' },
  );
  const at = (i: TonightItem) => ('at' in i ? i.at : Number.MAX_SAFE_INTEGER);
  return items.sort((a, b) => at(a) - at(b) || ORDER[a.kind] - ORDER[b.kind]);
}

/**
 * AVAILABLE SLEEP WINDOW: the most sleep the plan allows, from the intended
 * bedtime to the relevant Main Wake-Up (e.g. 23:00 → 06:30 = 450 minutes).
 * It is NOT sleep: never "hours slept", "actual sleep" or "sleep quality".
 * Null when that morning has no Main Wake-Up. Foundation for later analytics
 * (nothing shows it yet, and no usage data is collected for it).
 */
export function availableSleepWindow(night: Pick<NightWindow, 'bedtimeAt' | 'mainWakeUp'>): { minutes: number } | null {
  if (!night.mainWakeUp || night.mainWakeUp.at <= night.bedtimeAt) return null;
  return { minutes: Math.round((night.mainWakeUp.at - night.bedtimeAt) / MIN) };
}

/** Where the night is: before wind-down, winding down, or after bedtime (until the morning end). */
export type NightPhase = 'evening' | 'wind_down' | 'night';

export function nightPhase(night: NightWindow, now: number): NightPhase {
  if (now >= night.bedtimeAt) return 'night';
  if (now >= night.windDownAt) return 'wind_down';
  return 'evening';
}

/* ---------- Native schedule (DeviceActivity) ---------- */

/** Apple's weekday numbering: 1 = Sunday … 7 = Saturday. */
const appleWeekday = (day: Weekday | number) => (((day % 7) + 7) % 7) + 1;

export type NativeNightSchedule = {
  /** `terbit.night.<weekday>` (the evening's weekday). */
  id: string;
  start: { weekday: number; hour: number; minute: number };
  end: { weekday: number; hour: number; minute: number };
};

/** A one-time marker: at this moment, end that night's restrictions early (a one-off Main Wake-Up). */
export type NativeEarlyEnd = { id: string; year: number; month: number; day: number; hour: number; minute: number };

export type NativeRestrictionPlan = {
  /** Apple's opaque selection (null: nothing to restrict). */
  selection: string | null;
  nights: NativeNightSchedule[];
  earlyEnds: NativeEarlyEnd[];
  /** Restrictions should be on right now (inside tonight's period, not ended early). */
  shieldNow: boolean;
  /** Changes whenever the schedule does, so unchanged schedules aren't restarted. */
  signature: string;
};

/**
 * What the phone schedules natively so restrictions start (at wind-down) and
 * end with Terbit MY closed. One repeating DeviceActivity schedule per night of the
 * week (Apple allows 20), ending at that weekday's REPEATING Main Wake-Up,
 * so it keeps working even if Terbit MY isn't opened for weeks. A one-off
 * Main Wake-Up earlier than usual adds a dated "end early" marker for that
 * night. (A one-off later than usual is ignored: restrictions end at the
 * usual time, the safe direction.) Null: nothing should be scheduled.
 */
export function nativeRestrictionPlan(params: {
  routine: NightRoutine | null;
  alarms: readonly Alarm[];
  now: number;
  override?: RestrictionOverride;
  recorded?: Recorded;
}): NativeRestrictionPlan | null {
  const { routine, alarms, now, override = null, recorded = [] } = params;
  if (!routine || !routine.enabled || !restrictsApps(routine)) return null;
  const repeating = alarms.filter((a) => a.weekdays.length > 0);

  const nights: NativeNightSchedule[] = [];
  const earlyEnds: NativeEarlyEnd[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const evening = dayStart(now, offset);
    if (!appliesOnEvening(routine, evening)) continue;
    // Restrictions (and so the DeviceActivity interval and its shield) start at wind-down.
    const start = atNight(evening, restrictionStartTime(routine));
    const usual = restrictionEnd(routine, repeating, evening).at;
    const actual = restrictionEnd(routine, alarms, evening, recorded).at;
    const startDate = new Date(start);
    const endDate = new Date(usual);
    nights.push({
      id: `terbit.night.${evening.getDay()}`,
      start: { weekday: appleWeekday(startDate.getDay()), hour: startDate.getHours(), minute: startDate.getMinutes() },
      end: { weekday: appleWeekday(endDate.getDay()), hour: endDate.getHours(), minute: endDate.getMinutes() },
    });
    if (actual < usual && actual > now) {
      const e = new Date(actual);
      earlyEnds.push({ id: `terbit.night.end.${localDayKey(actual)}`, year: e.getFullYear(), month: e.getMonth() + 1, day: e.getDate(), hour: e.getHours(), minute: e.getMinutes() });
    }
  }
  nights.sort((a, b) => a.id.localeCompare(b.id));
  const state = restrictionState({ routine, alarms, now, available: true, override, recorded });
  const signature = JSON.stringify({ selection: routine.selection.token, nights, earlyEnds });
  return { selection: routine.selection.token, nights, earlyEnds, shieldNow: state.kind === 'active', signature };
}
