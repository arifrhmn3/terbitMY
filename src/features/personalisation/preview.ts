import { COMPLETION_MODE_LABEL, describeMission, formatAlarmTime, WEEKDAY_SHORT, type Weekday } from '@/features/alarms/alarm';
import { MAIN_WAKE_UP_TAG } from '@/features/alarms/main-wake-up';
import { formatDuration } from '@/features/night/labels';

import { toMinutes, type PlannedAlarm, type RoutinePlan } from './plan';
import { alarmPlusReasons, planPlusReasons, type PlusReason } from './plan-entitlements';
import { DAY_PART_LABEL } from './types';

/**
 * The proposed weekly schedule, as the review screen shows it. Days with
 * the same alarms are grouped ("Mon–Fri", "Sat–Sun", "Every day"); nothing
 * about the grouping is hard-coded. Technical alarm settings stay out: only
 * time, what it's for, the mode, the part of day and (Main Wake-Up) snooze.
 */
export type PreviewItem = {
  time: string;
  title: string;
  detail: string;
  snooze: string | null;
  isMainWakeUp: boolean;
  /** Why this item would need Terbit+ (data for 6F; not shown as a paywall in 6A). */
  plus: PlusReason[];
};
export type PreviewGroup = { days: string; items: PreviewItem[] };
/** The sleep TARGETS (shown even without a Night Routine), and whether a Night Routine is part of this plan. */
export type PreviewNight = {
  windDown: string;
  bedtime: string;
  nightRoutine: boolean;
  plus: PlusReason[];
  /** Bedtime → that night's next Main Wake-Up, grouped by nights with the same length. Never called sleep. */
  availableSleepWindow: { nights: string; duration: string }[];
};
export type RoutinePreview = { groups: PreviewGroup[]; night: PreviewNight | null };

/** Days in calendar order starting Monday, so groups read like a week. */
const WEEK: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** "Every day", "Mon–Fri", "Sat–Sun", "Sun–Thu", or "Mon, Wed". Ranges may wrap around the week. */
export function describeDayRange(days: readonly Weekday[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Every day';
  if (set.size === 0) return '';
  const order = WEEK.filter((d) => set.has(d));
  // A cyclic run: some day in the set whose previous day isn't, and the rest follow on.
  for (const start of order) {
    const before = WEEK[(WEEK.indexOf(start) + 6) % 7];
    if (set.has(before)) continue;
    const run = Array.from({ length: set.size }, (_, i) => WEEK[(WEEK.indexOf(start) + i) % 7]);
    if (run.every((d) => set.has(d))) {
      return run.length === 1 ? WEEKDAY_SHORT[start] : `${WEEKDAY_SHORT[start]}–${WEEKDAY_SHORT[run[run.length - 1]]}`;
    }
  }
  return order.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

function itemFor(planned: PlannedAlarm, plan: RoutinePlan): PreviewItem {
  const { draft } = planned;
  const goal = plan.goals.find((g) => g.category === planned.category);
  const mode = COMPLETION_MODE_LABEL[draft.completionMode];
  const detail = goal ? `${goal.title} · ${mode} · ${describeMission(draft.mission)}` : `${mode} · No mission`;
  return {
    time: formatAlarmTime(draft),
    title: draft.isPrimary ? MAIN_WAKE_UP_TAG : `${goal?.title ?? ''} · ${DAY_PART_LABEL[planned.part]}`,
    detail,
    snooze: draft.isPrimary
      ? draft.snooze.enabled
        ? `${draft.snooze.minutes} min snooze × ${draft.snooze.maxSnoozes}`
        : 'No snooze'
      : null,
    isMainWakeUp: draft.isPrimary,
    plus: alarmPlusReasons(planned),
  };
}

function groupBy<T>(days: readonly Weekday[], keyOf: (d: Weekday) => string, valueOf: (d: Weekday) => T): { days: Weekday[]; value: T }[] {
  const groups: { key: string; days: Weekday[]; value: T }[] = [];
  for (const day of days) {
    const key = keyOf(day);
    const group = groups.find((g) => g.key === key);
    if (group) group.days.push(day);
    else groups.push({ key, days: [day], value: valueOf(day) });
  }
  return groups;
}

export function buildPreview(plan: RoutinePlan): RoutinePreview {
  const itemsOn = (day: Weekday) =>
    plan.alarms
      .filter((a) => a.draft.weekdays.includes(day))
      .sort((a, b) => toMinutes(a.draft) - toMinutes(b.draft))
      .map((a) => itemFor(a, plan));
  const groups = groupBy(WEEK, (d) => JSON.stringify(itemsOn(d)), itemsOn)
    .filter((g) => g.value.length > 0)
    .map((g) => ({ days: describeDayRange(g.days), items: g.value }));

  let night: PreviewNight | null = null;
  const targets = plan.sleepTargets;
  if (targets) {
    const bedtime = toMinutes(targets.bedtime);
    // The night starting on `evening` ends at the next day's Main Wake-Up (if there is one).
    const windowFor = (evening: Weekday): number | null => {
      const morning = ((evening + 1) % 7) as Weekday;
      const main = plan.alarms.find((a) => a.draft.isPrimary && a.draft.weekdays.includes(morning));
      if (!main) return null;
      return (toMinutes(main.draft) - bedtime + 1440) % 1440;
    };
    const sleepGroups = groupBy(WEEK, (d) => String(windowFor(d)), windowFor).filter((g) => g.value !== null && g.value > 0);
    night = {
      windDown: formatAlarmTime(targets.windDown),
      bedtime: formatAlarmTime(targets.bedtime),
      nightRoutine: plan.night !== null,
      plus: planPlusReasons(plan).night,
      availableSleepWindow: sleepGroups.map((g) => ({ nights: `${describeDayRange(g.days)} nights`.replace('Every day nights', 'Every night'), duration: formatDuration(g.value!) })),
    };
  }
  return { groups, night };
}
