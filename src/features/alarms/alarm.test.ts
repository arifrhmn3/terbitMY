import { describe, expect, it } from '@jest/globals';

import {
  createAlarmDraft,
  describeMission,
  describeRepeat,
  describeSnooze,
  formatAlarmTime,
  nextOccurrence,
  sortAlarms,
  toggleWeekday,
  validateAlarm,
  withPrimary,
  type Alarm,
  type Weekday,
} from './alarm';

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return { ...createAlarmDraft(), id: 'a', createdAt: 0, updatedAt: 0, ...overrides };
}

describe('validateAlarm', () => {
  it('accepts the default draft', () => {
    expect(validateAlarm(createAlarmDraft())).toEqual([]);
  });

  it('rejects out-of-range values', () => {
    expect(validateAlarm(createAlarmDraft({ hour: 24, minute: 60 }))).toEqual(['invalid-hour', 'invalid-minute']);
    expect(validateAlarm(createAlarmDraft({ hour: 6.5 }))).toEqual(['invalid-hour']);
    expect(validateAlarm(createAlarmDraft({ weekdays: [7 as never] }))).toEqual(['invalid-weekday']);
    expect(validateAlarm(createAlarmDraft({ label: 'x'.repeat(41) }))).toEqual(['label-too-long']);
  });
});

describe('formatting', () => {
  it('formats time as 24-hour', () => {
    expect(formatAlarmTime({ hour: 6, minute: 5 })).toBe('06:05');
    expect(formatAlarmTime({ hour: 23, minute: 59 })).toBe('23:59');
  });

  const repeatCases: [Weekday[], string][] = [
    [[], 'Once'],
    [[0, 1, 2, 3, 4, 5, 6], 'Every day'],
    [[5, 1, 3, 2, 4], 'Weekdays'],
    [[6, 0], 'Weekends'],
    [[0, 1, 3], 'Mon, Wed, Sun'],
  ];

  it.each(repeatCases)('describes repeat %j as "%s"', (days, text) => {
    expect(describeRepeat(days)).toBe(text);
  });

  it('describes mission and snooze', () => {
    expect(describeMission({ type: 'none' })).toBe('No mission');
    expect(describeMission({ type: 'math', difficulty: 'hard', questionCount: 10 })).toBe(
      'Maths · Hard · 10 questions',
    );
    expect(describeSnooze({ enabled: false, minutes: 10 })).toBe('Off');
    expect(describeSnooze({ enabled: true, minutes: 10 })).toBe('10 min');
  });
});

describe('toggleWeekday', () => {
  it('adds in sorted order and removes', () => {
    expect(toggleWeekday([5, 1], 3)).toEqual([1, 3, 5]);
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5]);
  });
});

describe('withPrimary', () => {
  it('keeps exactly one primary alarm', () => {
    const list = [alarm({ id: 'a', isPrimary: true }), alarm({ id: 'b' }), alarm({ id: 'c' })];
    expect(withPrimary(list, 'b').map((a) => a.isPrimary)).toEqual([false, true, false]);
    expect(withPrimary(list, null).some((a) => a.isPrimary)).toBe(false);
  });
});

describe('sortAlarms', () => {
  it('orders by time of day', () => {
    const list = [alarm({ id: 'late', hour: 9 }), alarm({ id: 'early', hour: 5, minute: 45 })];
    expect(sortAlarms(list).map((a) => a.id)).toEqual(['early', 'late']);
  });
});

describe('nextOccurrence', () => {
  // Tuesday 6 October 2026, 07:00 local time
  const tuesday7am = new Date(2026, 9, 6, 7, 0);

  it('is null when disabled', () => {
    expect(nextOccurrence(alarm({ enabled: false }), tuesday7am)).toBeNull();
  });

  it('rolls a one-off alarm to tomorrow if the time has passed today', () => {
    expect(nextOccurrence(alarm({ weekdays: [], hour: 6, minute: 30 }), tuesday7am)).toEqual(
      new Date(2026, 9, 7, 6, 30),
    );
    expect(nextOccurrence(alarm({ weekdays: [], hour: 8, minute: 0 }), tuesday7am)).toEqual(
      new Date(2026, 9, 6, 8, 0),
    );
  });

  it('skips to the next selected weekday', () => {
    // Weekdays at 06:30 → Wednesday
    expect(nextOccurrence(alarm({ weekdays: [1, 2, 3, 4, 5] }), tuesday7am)).toEqual(new Date(2026, 9, 7, 6, 30));
    // Saturday only → Saturday 10 October
    expect(nextOccurrence(alarm({ weekdays: [6] }), tuesday7am)).toEqual(new Date(2026, 9, 10, 6, 30));
    // Tuesday only, time passed → next Tuesday
    expect(nextOccurrence(alarm({ weekdays: [2] }), tuesday7am)).toEqual(new Date(2026, 9, 13, 6, 30));
  });
});
