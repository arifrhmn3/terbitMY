import type { MissionDifficulty, MissionQuestionCount } from '@/features/missions/types';

import type { CompletionMode, GentleReminderMinutes, MaxSnoozes, SnoozeMinutes, Weekday } from './alarm';

/**
 * PROVISIONAL ALARM DEFAULTS. Every default a new alarm gets lives here:
 * Quick Save in the creation flow, the full editor and stored-data fallbacks
 * all read this one place, so changing a default needs no screen change.
 */
export type AlarmDefaults = {
  readonly hour: number;
  readonly minute: number;
  readonly weekdays: readonly Weekday[];
  readonly enabled: boolean;
  readonly label: string;
  readonly completionMode: CompletionMode;
  readonly gentleReminderMinutes: GentleReminderMinutes;
  readonly snooze: { readonly enabled: boolean; readonly minutes: SnoozeMinutes; readonly maxSnoozes: MaxSnoozes };
  readonly soundId: string;
  readonly difficulty: MissionDifficulty;
  readonly questionCount: MissionQuestionCount;
};

export const ALARM_DEFAULTS: AlarmDefaults = {
  hour: 6,
  minute: 30,
  /** Monday–Friday. (Empty would be a one-time alarm.) */
  weekdays: [1, 2, 3, 4, 5],
  enabled: true,
  label: '',
  completionMode: 'reward',
  /** Gentle mode only: minutes after the alarm stops before the follow-up reminder. */
  gentleReminderMinutes: 10,
  /** One alarm with up to 3 extra rings, 10 minutes apart (e.g. 6:30, 6:40, 6:50, 7:00). */
  snooze: { enabled: true, minutes: 10, maxSnoozes: 3 },
  soundId: 'system-default',
  /** Missions with a difficulty (Maths, Quiz, Fitness, Reflection length). */
  difficulty: 'easy',
  /** Maths and Quiz. */
  questionCount: 3,
};

// The Main Wake-Up Alarm is never a default: it's chosen through the morning
// decision (`morning.ts`): a new alarm in the Morning window is offered as the
// Main Wake-Up, or set against the existing one.
