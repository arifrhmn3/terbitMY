import { createAlarmDraft, type AlarmDraft, type AlarmMission, type CompletionMode, type Weekday } from '@/features/alarms/alarm';
import { ALARM_DEFAULTS } from '@/features/alarms/alarm-defaults';
import { MISSION_CATEGORIES, type MissionCategory } from '@/features/alarms/creation';
import type { ClockTime } from '@/features/night/night-routine';

import { categoryTitle, goalTitle, recommendedMission, validGoal, type RecommendationContext } from './recommend';
import type { DayPart, PersonalisationAnswers, SleepAnswer } from './types';

/**
 * SCHEDULE GENERATION (pure, deterministic): answers → the alarms and
 * Night Routine times Terbit proposes. Accepting it saves these through the
 * normal alarm and Night Routine stores (`apply.ts`), so they are real
 * alarms from then on, and the Main Wake-Up rules apply as usual.
 *
 * Rules:
 * 1. Main Wake-Up: one repeating alarm for weekdays (Mon–Fri) and one for
 *    weekends (Sat–Sun), or a single every-day one when the times are the
 *    same. Weekends "off" leaves Saturday and Sunday without one. Their days
 *    never overlap, so each date has at most one Main Wake-Up. Only these
 *    carry the snooze answer (snooze is a Main Wake-Up feature).
 * 2. Morning goals: the first (in Education → Fitness → Faith order) is the
 *    Main Wake-Up's own mission, with that goal's mode. Further Morning
 *    goals are ordinary alarms 15, 30… minutes after the Main Wake-Up, on
 *    the same days. A Main Wake-Up with no Morning goal has no mission.
 * 3. Afternoon / Night goals: ordinary (never Main Wake-Up) alarms every
 *    day, at the chosen time or the suggestion (Afternoon 12:30; Night 30
 *    minutes before wind-down, or 21:00 without a Night Routine). Two goals
 *    at the same time are spaced 15 minutes apart.
 * 4. Missions come from the recommendation policy (`recommend.ts`), Easy.
 * 5. Sleep targets (wind-down, bedtime) are always kept for the preview and
 *    the Night suggestion; a Night Routine is only planned when the user
 *    explicitly chose to add or update one.
 *
 * Which items need Terbit+ later is worked out separately from this output
 * (`plan-entitlements.ts`), so gating in 6F needs no change here.
 */
export const SCHEDULE_POLICY = {
  afternoonSuggestion: { hour: 12, minute: 30 } as ClockTime,
  nightLeadMinutes: 30,
  nightFallback: { hour: 21, minute: 0 } as ClockTime,
  /** Gap between stacked alarms (extra Morning goals, two goals at the same time). */
  gapMinutes: 15,
} as const;

/**
 * Where a generated alarm sits in the routine. Reruns use it to update the
 * same alarm instead of adding another (see `apply.ts`).
 */
export type PlanSlot = 'wake:weekday' | 'wake:weekend' | `morning:${MissionCategory}:weekday` | `morning:${MissionCategory}:weekend` | `goal:${MissionCategory}`;

export type PlannedAlarm = {
  slot: PlanSlot;
  draft: AlarmDraft;
  /** The goal this alarm holds the user to (null: a Main Wake-Up without a Morning goal). */
  category: MissionCategory | null;
  part: DayPart;
};

export type PlanGoal = { category: MissionCategory; title: string; goal: string; mode: CompletionMode; part: DayPart; mission: AlarmMission };

export type RoutinePlan = {
  alarms: PlannedAlarm[];
  /** The user's wind-down and bedtime targets (personalisation info), or null if skipped. */
  sleepTargets: SleepAnswer | null;
  /** Night Routine times to set: only when explicitly chosen; null = no Night Routine change. */
  night: SleepAnswer | null;
  /** "Your Terbit plan": one line per goal. */
  goals: PlanGoal[];
};

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const WEEKEND: Weekday[] = [0, 6];
const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const toMinutes = (t: ClockTime) => t.hour * 60 + t.minute;
export function fromMinutes(minutes: number): ClockTime {
  const m = ((minutes % 1440) + 1440) % 1440;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

/** The time an Afternoon / Night goal is suggested for, when no exact time was chosen. */
export function suggestedTime(part: Exclude<DayPart, 'morning'>, sleep: SleepAnswer | null): ClockTime {
  if (part === 'day') return { ...SCHEDULE_POLICY.afternoonSuggestion };
  return sleep ? fromMinutes(toMinutes(sleep.windDown) - SCHEDULE_POLICY.nightLeadMinutes) : { ...SCHEDULE_POLICY.nightFallback };
}

const LABEL_WAKE = { weekday: 'Weekday wake-up', weekend: 'Weekend wake-up', everyday: 'Daily wake-up' } as const;

export function buildPlan(answers: PersonalisationAnswers): RoutinePlan {
  const context: RecommendationContext = { mobilityProfile: answers.mobilityProfile, faith: answers.faith };
  const goals: PlanGoal[] = MISSION_CATEGORIES.flatMap((category) => {
    const a = answers.goals[category];
    if (!a) return [];
    const goal = validGoal(category, a.goal as never, context);
    return [{ category, title: categoryTitle(category, context), goal: goalTitle(category, goal, context), mode: a.mode, part: a.part, mission: recommendedMission(category, goal, context) }];
  });

  const alarms: PlannedAlarm[] = [];
  const morning = goals.filter((g) => g.part === 'morning');
  const [lead, ...extras] = morning;

  const { wake } = answers;
  const blocks: { key: 'weekday' | 'weekend'; days: Weekday[]; time: ClockTime; label: string }[] = [];
  if (wake.weekend === 'same') blocks.push({ key: 'weekday', days: EVERY_DAY, time: wake.weekday, label: LABEL_WAKE.everyday });
  else {
    blocks.push({ key: 'weekday', days: WEEKDAYS, time: wake.weekday, label: LABEL_WAKE.weekday });
    if (wake.weekend === 'different') blocks.push({ key: 'weekend', days: WEEKEND, time: wake.weekendTime, label: LABEL_WAKE.weekend });
  }

  for (const block of blocks) {
    alarms.push({
      slot: `wake:${block.key}`,
      category: lead?.category ?? null,
      part: 'morning',
      draft: createAlarmDraft({
        ...block.time,
        weekdays: [...block.days],
        label: block.label,
        mission: lead?.mission ?? { type: 'none' },
        completionMode: lead?.mode ?? ALARM_DEFAULTS.completionMode,
        snooze: { ...wake.snooze },
        isPrimary: true,
      }),
    });
    extras.forEach((goal, i) => {
      alarms.push({
        slot: `morning:${goal.category}:${block.key}`,
        category: goal.category,
        part: 'morning',
        draft: createAlarmDraft({
          ...fromMinutes(toMinutes(block.time) + SCHEDULE_POLICY.gapMinutes * (i + 1)),
          weekdays: [...block.days],
          label: `${goal.title} · Morning`,
          mission: goal.mission,
          completionMode: goal.mode,
        }),
      });
    });
  }

  const taken = new Set<number>();
  for (const goal of goals.filter((g) => g.part !== 'morning')) {
    const chosen = answers.goals[goal.category]!.time ?? suggestedTime(goal.part as Exclude<DayPart, 'morning'>, answers.sleep);
    let minutes = toMinutes(chosen);
    while (taken.has(minutes)) minutes = (minutes + SCHEDULE_POLICY.gapMinutes) % 1440;
    taken.add(minutes);
    alarms.push({
      slot: `goal:${goal.category}`,
      category: goal.category,
      part: goal.part,
      draft: createAlarmDraft({
        ...fromMinutes(minutes),
        weekdays: [...EVERY_DAY],
        label: `${goal.title} · ${goal.part === 'day' ? 'Afternoon' : 'Night'}`,
        mission: goal.mission,
        completionMode: goal.mode,
      }),
    });
  }

  return { alarms, sleepTargets: answers.sleep, night: answers.nightRoutine ? answers.sleep : null, goals };
}
