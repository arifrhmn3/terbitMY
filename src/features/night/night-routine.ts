import type { Weekday } from '@/features/alarms/alarm';

/**
 * THE NIGHT ROUTINE: one central model for the evening (Phase 4). Every
 * Night Routine setting lives here; screens, Today, the weekly schedule and
 * native scheduling read it, and future onboarding can fill it in
 * (`nightRoutineFromAnswers`) without any screen knowing the questions.
 *
 *   wind-down + apps restricted ─► bedtime ─► sleep ─► Main Wake-Up (restrictions end)
 *
 * THE RESTRICTION START RULE: chosen apps are restricted from WIND-DOWN
 * (`restrictionStartTime`), so wind-down removes distractions before bed.
 * There's no separate restriction-start setting: wind-down is the one source
 * of truth. (Routines saved before this rule may hold an old
 * `restrictionStart`; it's ignored when read, see `night-repository.ts`.)
 *
 * Night times are "evening clock" times: 12:00–23:59 belong to the evening
 * a night starts, 00:00–11:59 to the early morning after it (so a bedtime of
 * 00:30 is still that night). See `night-timeline.ts`.
 */
export type ClockTime = { hour: number; minute: number };

/** What ends the restricted period in the morning. */
export type RestrictionEndRule =
  /** The next morning's Main Wake-Up (`resolvedMainWakeUp`); `fallbackEnd` if that morning has none. */
  | 'main_wake_up'
  /** Always `fallbackEnd`. */
  | 'fixed_time';

/** An optional calming activity during wind-down. Reuses existing missions (no XP; practice). */
export type NightActivity = 'none' | 'reflection' | 'breathing';

/**
 * The apps and categories chosen in Apple's Screen Time picker. `token` is
 * Apple's opaque, encoded selection: Terbit MY can't read which apps it
 * contains, only how many. Stays on this phone (never backed up).
 */
export type AppSelection = {
  token: string | null;
  applications: number;
  categories: number;
  webDomains: number;
};

export type NightRoutine = {
  id: string;
  enabled: boolean;
  /** The evenings it applies to (the night starting that day). */
  weekdays: Weekday[];
  /** The start of the digital quiet period: apps restricted, reminder, calming activity. Not bedtime. */
  windDown: ClockTime;
  /** The intended sleep target. Nothing new starts here; it anchors the Available Sleep Window. */
  bedtime: ClockTime;
  /** Off: no apps are restricted (wind-down and bedtime still work). */
  restrictApps: boolean;
  selection: AppSelection;
  endRule: RestrictionEndRule;
  /** The morning time used when there's no Main Wake-Up, or with `fixed_time`. */
  fallbackEnd: ClockTime;
  activity: NightActivity;
  /** A local notification at wind-down. */
  windDownReminder: boolean;
  createdAt: number;
  updatedAt: number;
};

export type NightRoutineDraft = Omit<NightRoutine, 'id' | 'createdAt' | 'updatedAt'>;

export const EMPTY_SELECTION: AppSelection = { token: null, applications: 0, categories: 0, webDomains: 0 };

/** The one id: a single Night Routine for now (the model allows more later). */
export const NIGHT_ROUTINE_ID = 'night';

/** Central defaults (as ALARM_DEFAULTS is for alarms). Changing them needs no screen change. */
export const NIGHT_ROUTINE_DEFAULTS: NightRoutineDraft = {
  enabled: true,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  windDown: { hour: 22, minute: 30 },
  bedtime: { hour: 23, minute: 0 },
  restrictApps: true,
  selection: EMPTY_SELECTION,
  endRule: 'main_wake_up',
  fallbackEnd: { hour: 7, minute: 0 },
  activity: 'none',
  windDownReminder: true,
};

export function createNightRoutineDraft(overrides: Partial<NightRoutineDraft> = {}): NightRoutineDraft {
  return { ...NIGHT_ROUTINE_DEFAULTS, selection: { ...EMPTY_SELECTION }, ...overrides };
}

/** Minutes after noon (0–1439): the order times happen in during one night. */
export function nightMinutes(time: ClockTime): number {
  return (time.hour * 60 + time.minute - 12 * 60 + 24 * 60) % (24 * 60);
}

/** When the chosen apps become restricted: always wind-down (see the rule above). */
export function restrictionStartTime(routine: Pick<NightRoutine, 'windDown'>): ClockTime {
  return routine.windDown;
}

/** DeviceActivity needs at least 15 minutes; a restricted period this short isn't useful anyway. */
export const MIN_RESTRICTION_MINUTES = 15;

export function selectionCount(selection: AppSelection): number {
  return selection.applications + selection.categories + selection.webDomains;
}

/** Restrictions apply only when turned on and something was chosen. */
export function restrictsApps(routine: Pick<NightRoutine, 'restrictApps' | 'selection'>): boolean {
  return routine.restrictApps && hasSelection(routine.selection);
}

function hasSelection(selection: AppSelection): boolean {
  return selection.token !== null && selectionCount(selection) > 0;
}

/** Problems that stop it saving, in plain words. */
export function validateNightRoutine(draft: NightRoutineDraft): string[] {
  const errors: string[] = [];
  const valid = (t: ClockTime) => Number.isInteger(t.hour) && Number.isInteger(t.minute) && t.hour >= 0 && t.hour < 24 && t.minute >= 0 && t.minute < 60;
  if (![draft.windDown, draft.bedtime, draft.fallbackEnd].every(valid)) errors.push('Invalid time');
  if (draft.enabled && draft.weekdays.length === 0) errors.push('Choose at least one night');
  if (nightMinutes(draft.windDown) > nightMinutes(draft.bedtime)) errors.push('Wind-down must start before bedtime');
  if (draft.fallbackEnd.hour >= 12) errors.push('The morning end time must be before noon');
  if (nightMinutes(draft.fallbackEnd) - nightMinutes(restrictionStartTime(draft)) < MIN_RESTRICTION_MINUTES) {
    errors.push('The morning end time must be at least 15 minutes after wind-down');
  }
  return errors;
}

/**
 * FUTURE ONBOARDING: answers → a Night Routine, with no screen involved.
 * Wind-down defaults to 30 minutes before bedtime; restrictions start at wind-down.
 */
export function nightRoutineFromAnswers(answers: {
  bedtime: ClockTime;
  windDownMinutes?: number;
  restrictDistractingApps?: boolean;
  activity?: NightActivity;
  nights?: Weekday[];
}): NightRoutineDraft {
  const lead = answers.windDownMinutes ?? 30;
  const bed = answers.bedtime.hour * 60 + answers.bedtime.minute;
  const wind = (bed - lead + 24 * 60) % (24 * 60);
  return createNightRoutineDraft({
    bedtime: answers.bedtime,
    windDown: { hour: Math.floor(wind / 60), minute: wind % 60 },
    restrictApps: answers.restrictDistractingApps ?? true,
    activity: answers.activity ?? 'none',
    ...(answers.nights ? { weekdays: answers.nights } : {}),
  });
}
