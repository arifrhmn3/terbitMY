import { evaluateMorning } from './accountability';
import type { AlarmOccurrence } from './occurrence';

export type GentleReminder = {
  /** One reminder per morning, so scheduling again replaces it. */
  id: string;
  title: string;
  body: string;
  fireAt: number;
};

export function gentleReminderId(occurrenceId: string): string {
  return `gentle-${occurrenceId}`;
}

/**
 * Which Gentle-mode reminders should exist: one for each open morning whose
 * follow-up time is still ahead; every other recent morning's reminder is
 * cancelled (done, given up, closed, or another mode). Safe to run any time.
 */
export function planGentleReminders(
  occurrences: AlarmOccurrence[],
  now: number,
): { schedule: GentleReminder[]; cancel: string[] } {
  const schedule: GentleReminder[] = [];
  const cancel: string[] = [];
  for (const o of occurrences) {
    const followUpAt = evaluateMorning(o).followUpAt;
    if (followUpAt !== null && followUpAt > now) {
      schedule.push({
        id: gentleReminderId(o.id),
        title: o.alarmLabel ? `${o.alarmLabel}: mission waiting` : 'Your Terbit MY mission is waiting',
        body: 'Open Terbit MY to finish this morning’s mission.',
        fireAt: followUpAt,
      });
    } else {
      cancel.push(gentleReminderId(o.id));
    }
  }
  return { schedule, cancel };
}
