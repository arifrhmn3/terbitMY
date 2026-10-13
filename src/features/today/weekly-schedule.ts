import type { Alarm, AlarmMission, CompletionMode, Weekday } from '@/features/alarms/alarm';
import { DAY_NAME, isActiveAlarm, mainWakeUpIdForDate, ringsOnDate } from '@/features/alarms/main-wake-up';
import { isOneOff } from '@/features/alarms/morning';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import type { NightRoutine } from '@/features/night/night-routine';
import { appliesOnEvening, nightWindow } from '@/features/night/night-timeline';
import { localDayKey, type DayKey } from '@/features/progress/day';

/**
 * The weekly schedule: the next seven days (today first), built only from
 * ACTIVE saved alarms (never deleted or turned-off ones, never history).
 * Repeating alarms appear on each of their weekdays; a one-off appears on
 * its date while it's still to ring. Each day has at most one Main Wake-Up
 * (`resolvedMainWakeUp`). Pure.
 *
 * Each day is split into sections. For now there is a single section;
 * Morning / Throughout the Day / Night can be added later by changing
 * `sectionOf` only (the screen already renders a list of sections).
 */
export type WeeklyItem = {
  key: string;
  alarmId: string;
  hour: number;
  minute: number;
  label: string;
  mission: AlarmMission;
  mode: CompletionMode;
  isMainWakeUp: boolean;
  oneOff: boolean;
};

export type WeeklySectionId = 'all';
export type WeeklySection = { id: WeeklySectionId; title: string | null; items: WeeklyItem[] };

/** That evening's Night Routine, in one line (never repeated per alarm). */
export type WeeklyNight = {
  windDownAt: number;
  bedtimeAt: number;
  /** Null when no apps are restricted. */
  restrictions: { from: number; until: number } | null;
};

export type WeeklyDay = {
  date: DayKey;
  weekday: Weekday;
  /** "Today", "Tomorrow", or the weekday name. */
  title: string;
  sections: WeeklySection[];
  /** The Night Routine starting that evening, or null. */
  night: WeeklyNight | null;
};

/** Which section an alarm belongs to (one for now; see above). */
function sectionOf(_item: WeeklyItem): WeeklySectionId {
  return 'all';
}

export function buildWeeklySchedule(params: {
  alarms: readonly Alarm[];
  now: number;
  /** Today's recorded mornings: a one-off Main Wake-Up that already rang still owns today. */
  occurrences?: readonly AlarmOccurrence[];
  /** The Night Routine, if any (shown once per evening it applies to). */
  night?: NightRoutine | null;
  days?: number;
}): WeeklyDay[] {
  const { alarms, now, occurrences = [], night = null, days = 7 } = params;
  const start = new Date(now);
  const active = alarms.filter((a) => isActiveAlarm(a, now));
  const result: WeeklyDay[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12, 0);
    // Today is judged as of now; later days as of their own date.
    const time = offset === 0 ? now : date.getTime();
    const mainId = mainWakeUpIdForDate(alarms, time, offset === 0 ? occurrences : []);
    const items = active
      .filter((a) => ringsOnDate(a, time))
      .map(
        (a): WeeklyItem => ({
          key: `${a.id}-${localDayKey(time)}`,
          alarmId: a.id,
          hour: a.hour,
          minute: a.minute,
          label: a.label,
          mission: a.mission,
          mode: a.completionMode,
          isMainWakeUp: a.id === mainId,
          oneOff: isOneOff(a),
        }),
      )
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute) || a.alarmId.localeCompare(b.alarmId));

    const sections: WeeklySection[] = [];
    for (const item of items) {
      const id = sectionOf(item);
      let section = sections.find((s) => s.id === id);
      if (!section) sections.push((section = { id, title: null, items: [] }));
      section.items.push(item);
    }
    const weekday = date.getDay() as Weekday;
    result.push({
      date: localDayKey(time),
      weekday,
      title: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_NAME[weekday],
      sections,
      night: night && appliesOnEvening(night, date) ? weeklyNight(nightWindow(night, alarms, date.getTime())) : null,
    });
  }
  return result;
}

function weeklyNight(w: ReturnType<typeof nightWindow>): WeeklyNight {
  return {
    windDownAt: w.windDownAt,
    bedtimeAt: w.bedtimeAt,
    restrictions: w.restricts ? { from: w.restrictionStartAt, until: w.restrictionEndAt } : null,
  };
}
