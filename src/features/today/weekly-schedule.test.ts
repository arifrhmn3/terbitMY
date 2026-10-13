import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAlarmDraft, type Alarm, type AlarmDraft, type Weekday } from '@/features/alarms/alarm';
import { createOccurrence, markAlarmFired, type TransitionResult } from '@/features/alarms/occurrence';

import { buildWeeklySchedule } from './weekly-schedule';

/** Tuesday 13 Oct 2026, 05:00 local. */
const NOW = new Date(2026, 9, 13, 5, 0).getTime();
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const saved = (id: string, o: Partial<AlarmDraft>, updatedAt = NOW): Alarm => ({ ...createAlarmDraft(o), id, createdAt: 0, updatedAt });
const step = (r: TransitionResult) => {
  if (!r.ok) throw new Error(r.error);
  return r.occurrence;
};

const weekdayMain = saved('wk', { hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true });
const weekendMain = saved('we', { hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
const squats = saved('sq', { hour: 18, minute: 0, weekdays: [2, 4], mission: { type: 'fitness', exercise: 'squats', difficulty: 'easy' } });
const vocab = saved('vo', { hour: 12, minute: 30, weekdays: [1, 2, 3, 4, 5, 6, 0] });

const rows = (days: ReturnType<typeof buildWeeklySchedule>) =>
  days.map((d) => `${d.title}: ${d.sections.flatMap((s) => s.items.map((i) => `${i.hour}:${String(i.minute).padStart(2, '0')} ${i.alarmId}${i.isMainWakeUp ? '*' : ''}${i.oneOff ? ' (one-off)' : ''}`)).join(', ')}`);

describe('weekly schedule matrix', () => {
  it('seven days from today; repeating alarms on each of their weekdays; chronological; one Main Wake-Up (*) per day', () => {
    expect(rows(buildWeeklySchedule({ alarms: [squats, vocab, weekendMain, weekdayMain], now: NOW }))).toEqual([
      'Today: 6:30 wk*, 12:30 vo, 18:00 sq',
      'Tomorrow: 6:30 wk*, 12:30 vo',
      'Thursday: 6:30 wk*, 12:30 vo, 18:00 sq',
      'Friday: 6:30 wk*, 12:30 vo',
      'Saturday: 8:00 we*, 12:30 vo',
      'Sunday: 8:00 we*, 12:30 vo',
      'Monday: 6:30 wk*, 12:30 vo',
    ]);
  });

  it('never shows deleted or turned-off alarms', () => {
    const days = buildWeeklySchedule({ alarms: [{ ...squats, enabled: false }], now: NOW });
    expect(days.every((d) => d.sections.length === 0)).toBe(true);
  });

  it('an upcoming one-off appears on its date only; once rung it disappears', () => {
    const once = saved('once', { hour: 7, minute: 0, weekdays: [] }, new Date(2026, 9, 14, 20, 0).getTime()); // rings Thu 07:00
    expect(rows(buildWeeklySchedule({ alarms: [once], now: NOW }))[2]).toBe('Thursday: 7:00 once (one-off)');
    const afterIt = buildWeeklySchedule({ alarms: [once], now: new Date(2026, 9, 15, 7, 1).getTime() });
    expect(afterIt.every((d) => d.sections.length === 0)).toBe(true);
  });

  it('a one-off Main Wake-Up overrides only its date; the repeating alarm is listed there untagged', () => {
    const override = saved('once', { hour: 7, minute: 30, weekdays: [], isPrimary: true }, NOW); // today 07:30
    expect(rows(buildWeeklySchedule({ alarms: [weekdayMain, override], now: NOW })).slice(0, 2)).toEqual([
      'Today: 6:30 wk, 7:30 once* (one-off)',
      'Tomorrow: 6:30 wk*',
    ]);
  });

  it('a one-off Main Wake-Up that already rang today still owns today (given today’s mornings)', () => {
    const override = saved('once', { hour: 5, minute: 30, weekdays: [], isPrimary: true }, NOW - 60_000);
    const due = new Date(2026, 9, 13, 5, 30).getTime();
    const morning = step(markAlarmFired(createOccurrence({ alarm: override, scheduledAt: due, source: 'native', now: due }), due));
    const later = due + 60_000;
    const days = buildWeeklySchedule({ alarms: [weekdayMain, { ...override, enabled: false }], now: later, occurrences: [morning] });
    expect(rows(days)[0]).toBe('Today: 6:30 wk');
  });

  it('days are split into sections, ready for Morning / Day / Night later', () => {
    const [today] = buildWeeklySchedule({ alarms: [weekdayMain], now: NOW });
    expect(today.sections).toEqual([expect.objectContaining({ id: 'all', items: [expect.objectContaining({ alarmId: 'wk' })] })]);
  });

  it('the screen opens the alarm editor on tap (not mission resume), and Today links to it', () => {
    const root = join(__dirname, '..', '..', '..');
    const screen = readFileSync(join(root, 'src/app/(tabs)/today/week.tsx'), 'utf8');
    expect(screen).toContain("pathname: '/today/alarm/[id]'");
    expect(screen).not.toContain('/alarm/[occurrenceId]');
    const today = readFileSync(join(root, 'src/app/(tabs)/today/index.tsx'), 'utf8');
    expect(today).toContain('View weekly schedule');
    expect(today).toContain('href="/today/week"');
  });
});
