import type { MathDifficulty, MathQuestionCount } from '@/features/missions/math/questions';

/** Same numbering as `Date.getDay()`: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Monday-first, as calendars in Malaysia are usually shown. */
export const WEEKDAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export type AlarmMission =
  | { type: 'none' }
  | { type: 'math'; difficulty: MathDifficulty; questionCount: MathQuestionCount };

export type SnoozeMinutes = 5 | 10 | 15;
export const SNOOZE_MINUTES: readonly SnoozeMinutes[] = [5, 10, 15];

export type SnoozePreference = {
  enabled: boolean;
  minutes: SnoozeMinutes;
};

/**
 * How strictly the morning is judged (beta experiment). The phone's own Stop
 * control works in every mode. See `src/features/alarms/accountability.ts`.
 */
export type CompletionMode = 'reward' | 'challenge' | 'gentle';
export const COMPLETION_MODES: readonly CompletionMode[] = ['reward', 'challenge', 'gentle'];

export type GentleReminderMinutes = 5 | 10 | 15 | 30;
export const GENTLE_REMINDER_MINUTES: readonly GentleReminderMinutes[] = [5, 10, 15, 30];

/**
 * One alarm as the user configured it. The device copy is the source of
 * truth; whether it can actually ring is decided by `AlarmService`.
 */
export type Alarm = {
  id: string;
  /** 0–23, local time. */
  hour: number;
  /** 0–59. */
  minute: number;
  /** Empty means a one-off alarm (the next time this clock time comes round). */
  weekdays: Weekday[];
  enabled: boolean;
  label: string;
  mission: AlarmMission;
  snooze: SnoozePreference;
  /** The user's main wake-up alarm. At most one alarm has this set. */
  isPrimary: boolean;
  completionMode: CompletionMode;
  /** Gentle mode: minutes after the alarm stops before a follow-up reminder, if the mission isn't done. */
  gentleReminderMinutes: GentleReminderMinutes;
  createdAt: number;
  updatedAt: number;
};

export type AlarmDraft = Omit<Alarm, 'id' | 'createdAt' | 'updatedAt'>;

export function createAlarmDraft(overrides: Partial<AlarmDraft> = {}): AlarmDraft {
  return {
    hour: 6,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
    enabled: true,
    label: '',
    mission: { type: 'math', difficulty: 'easy', questionCount: 3 },
    snooze: { enabled: true, minutes: 5 },
    isPrimary: false,
    completionMode: 'reward',
    gentleReminderMinutes: 10,
    ...overrides,
  };
}

export function createAlarmId(): string {
  return `alarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Returns a sorted copy without duplicates. */
export function normalizeWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

export function toggleWeekday(days: readonly Weekday[], day: Weekday): Weekday[] {
  return days.includes(day) ? days.filter((d) => d !== day) : normalizeWeekdays([...days, day]);
}

export type AlarmValidationError = 'invalid-hour' | 'invalid-minute' | 'invalid-weekday' | 'label-too-long';

export const MAX_LABEL_LENGTH = 40;

export function validateAlarm(alarm: AlarmDraft): AlarmValidationError[] {
  const errors: AlarmValidationError[] = [];
  if (!Number.isInteger(alarm.hour) || alarm.hour < 0 || alarm.hour > 23) errors.push('invalid-hour');
  if (!Number.isInteger(alarm.minute) || alarm.minute < 0 || alarm.minute > 59) errors.push('invalid-minute');
  if (alarm.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('invalid-weekday');
  if (alarm.label.length > MAX_LABEL_LENGTH) errors.push('label-too-long');
  return errors;
}

/** "06:30" style, 24-hour. */
export function formatAlarmTime(alarm: Pick<Alarm, 'hour' | 'minute'>): string {
  return `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;
}

export function describeRepeat(weekdays: readonly Weekday[]): string {
  const days = normalizeWeekdays(weekdays);
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '0,6') return 'Weekends';
  return WEEKDAY_ORDER.filter((d) => days.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ');
}

export function describeMission(mission: AlarmMission): string {
  if (mission.type === 'none') return 'No mission';
  const level = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[mission.difficulty];
  return `Maths · ${level} · ${mission.questionCount} questions`;
}

export const COMPLETION_MODE_LABEL: Record<CompletionMode, string> = {
  reward: 'Reward',
  challenge: 'Challenge',
  gentle: 'Gentle',
};

export function describeSnooze(snooze: SnoozePreference): string {
  return snooze.enabled ? `${snooze.minutes} min` : 'Off';
}

/**
 * Applies the "only one primary alarm" rule after `primaryId` was chosen.
 * Pass `null` when no alarm should be primary.
 */
export function withPrimary(alarms: readonly Alarm[], primaryId: string | null): Alarm[] {
  return alarms.map((a) => (a.isPrimary === (a.id === primaryId) ? a : { ...a, isPrimary: a.id === primaryId }));
}

/** Earliest first, so the list reads like a day. */
export function sortAlarms(alarms: readonly Alarm[]): Alarm[] {
  return [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute) || a.createdAt - b.createdAt);
}

/**
 * The next local time this alarm is set for, or null if it is turned off.
 * This is only a calculation for display; it does not mean the alarm has
 * been scheduled with the operating system.
 */
export function nextOccurrence(alarm: Alarm, now: Date): Date | null {
  if (!alarm.enabled) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, alarm.hour, alarm.minute);
    if (candidate <= now) continue;
    if (alarm.weekdays.length === 0 || alarm.weekdays.includes(candidate.getDay() as Weekday)) {
      return candidate;
    }
  }
  return null;
}
