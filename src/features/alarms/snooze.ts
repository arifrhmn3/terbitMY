import type { SnoozePreference } from './alarm';

export type ScheduledRing = {
  hour: number;
  minute: number;
  /** 0 = the alarm itself; 1… = snooze number. */
  index: number;
  label: string;
  /** Minutes after the alarm time. */
  offsetMinutes: number;
};

/**
 * Every time ONE alarm can ring: the alarm, then up to `maxSnoozes` snoozes
 * `minutes` apart. A preview of a single routine (it never creates alarms,
 * and Today shows the alarm once). Times wrap past midnight.
 */
export function snoozeSchedule(time: { hour: number; minute: number }, snooze: SnoozePreference, mainLabel = 'Alarm'): ScheduledRing[] {
  const count = snooze.enabled ? snooze.maxSnoozes : 0;
  return Array.from({ length: count + 1 }, (_, index) => {
    const offsetMinutes = index * snooze.minutes;
    const total = (time.hour * 60 + time.minute + offsetMinutes) % (24 * 60);
    const label = index === 0 ? mainLabel : index === count ? 'Final snooze' : `Snooze ${index}`;
    return { hour: Math.floor(total / 60), minute: total % 60, index, label, offsetMinutes };
  });
}
