import { describe, expect, it } from '@jest/globals';

import type { NativeRecordPayload } from '../../../modules/terbit-alarms';

import {
  alarmKitFireEvents,
  androidFireEvents,
  dueTimesBetween,
  isNativeUpToDate,
  staleSavedAlarmIds,
} from './native-records';
import type { AlarmSpec } from './types';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime(); // October 2026; 6th is a Tuesday

function record(overrides: Partial<NativeRecordPayload>): NativeRecordPayload {
  return {
    kind: 'saved',
    alarmId: 'a',
    occurrenceId: null,
    nativeId: 'n',
    fireAt: at(7, 6, 30),
    createdAt: at(5, 12),
    state: 'scheduled',
    firedAt: null,
    stoppedAt: null,
    cancelledAt: null,
    stopAction: null,
    hour: 6,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

function spec(overrides: Partial<AlarmSpec> = {}): AlarmSpec {
  return {
    id: 'a',
    hour: 6,
    minute: 30,
    weekdays: [1, 2, 3, 4, 5],
    label: '',
    snoozeMinutes: null,
    missionRequired: true,
    title: 'Alarm',
    nextFireAt: at(7, 6, 30),
    completionMode: 'reward',
    ...overrides,
  };
}

describe('dueTimesBetween (repeat days)', () => {
  it('lists each selected weekday in the window', () => {
    // Sat 3 Oct 00:00 → Fri 9 Oct 23:59, weekdays 06:30 → Mon 5 … Fri 9.
    const due = dueTimesBetween({ hour: 6, minute: 30, weekdays: [1, 2, 3, 4, 5], fireAt: null }, at(3, 0), at(9, 23, 59));
    expect(due).toEqual([at(5, 6, 30), at(6, 6, 30), at(7, 6, 30), at(8, 6, 30), at(9, 6, 30)]);
  });

  it('uses the window edges exactly (from exclusive, to inclusive)', () => {
    const s = { hour: 6, minute: 30, weekdays: [2], fireAt: null };
    expect(dueTimesBetween(s, at(6, 6, 30), at(6, 23))).toEqual([]);
    expect(dueTimesBetween(s, at(6, 6), at(6, 6, 30))).toEqual([at(6, 6, 30)]);
  });

  it('handles weekends only and one-off alarms', () => {
    expect(dueTimesBetween({ hour: 9, minute: 0, weekdays: [0, 6], fireAt: null }, at(5, 0), at(12, 0))).toEqual([
      at(10, 9),
      at(11, 9),
    ]);
    expect(dueTimesBetween({ hour: 9, minute: 0, weekdays: [], fireAt: at(6, 9) }, at(6, 0), at(6, 10))).toEqual([at(6, 9)]);
    expect(dueTimesBetween({ hour: 9, minute: 0, weekdays: [], fireAt: at(6, 9) }, at(6, 9), at(6, 10))).toEqual([]);
  });
});

describe('androidFireEvents', () => {
  it('reports saved alarms the receiver recorded as fired, with how they were stopped', () => {
    const records = [
      record({ fireAt: at(6, 6, 30), firedAt: at(6, 6, 30) + 120, stoppedAt: at(6, 6, 33), stopAction: 'stop', state: 'stopped' }),
      record({ fireAt: at(7, 6, 30), state: 'scheduled' }),
      record({ kind: 'test', alarmId: 'native-test', fireAt: at(6, 7), firedAt: at(6, 7) }),
      record({ fireAt: at(1, 6, 30), firedAt: at(1, 6, 30) }),
    ];
    expect(androidFireEvents(records, at(5, 0))).toEqual([
      {
        alarmId: 'a',
        scheduledAt: at(6, 6, 30),
        firedAt: at(6, 6, 30) + 120,
        evidence: 'system',
        stoppedAt: at(6, 6, 33),
        stopAction: 'stop',
      },
    ]);
  });
});

describe('alarmKitFireEvents', () => {
  it('works out due times only while the alarm was registered', () => {
    const records = [
      // Registered Mon 5 Oct 12:00, cancelled (rescheduled) Wed 7 Oct 07:00.
      record({ nativeId: 'old', createdAt: at(5, 12), cancelledAt: at(7, 7), state: 'cancelled' }),
      // New schedule from Wed 7 Oct 07:00 at 06:45.
      record({ nativeId: 'new', createdAt: at(7, 7), minute: 45 }),
      record({ kind: 'test', alarmId: 'native-test', hour: 6, minute: 0 }),
    ];
    const events = alarmKitFireEvents(records, at(1, 0), at(8, 12));
    expect(events.map((e) => e.scheduledAt)).toEqual([at(6, 6, 30), at(7, 6, 30), at(8, 6, 45)]);
    expect(events.every((e) => e.evidence === 'schedule' && e.stoppedAt === null)).toBe(true);
  });

  it('includes a one-off alarm once its time has passed', () => {
    const once = record({ weekdays: [], fireAt: at(6, 8), createdAt: at(6, 7), state: 'finished' });
    expect(alarmKitFireEvents([once], at(5, 0), at(6, 7, 59))).toEqual([]);
    expect(alarmKitFireEvents([once], at(5, 0), at(6, 9)).map((e) => e.scheduledAt)).toEqual([at(6, 8)]);
  });
});

describe('isNativeUpToDate', () => {
  it('Android: matches a pending record with the same next fire time', () => {
    expect(isNativeUpToDate([record({})], spec(), 'alarm-manager')).toBe(true);
    expect(isNativeUpToDate([record({})], spec({ nextFireAt: at(8, 6, 30) }), 'alarm-manager')).toBe(false);
    expect(isNativeUpToDate([record({ cancelledAt: 1 })], spec(), 'alarm-manager')).toBe(false);
  });

  it('iOS: matches a live AlarmKit alarm with the same schedule', () => {
    expect(isNativeUpToDate([record({})], spec(), 'alarmkit')).toBe(true);
    expect(isNativeUpToDate([record({})], spec({ minute: 45 }), 'alarmkit')).toBe(false);
    expect(isNativeUpToDate([record({})], spec({ weekdays: [1] }), 'alarmkit')).toBe(false);
    expect(isNativeUpToDate([record({ state: 'finished' })], spec(), 'alarmkit')).toBe(false);
  });
});

describe('staleSavedAlarmIds', () => {
  it('finds future native alarms whose saved alarm is no longer enabled, never fired ones', () => {
    const records = [
      record({ alarmId: 'kept' }),
      record({ alarmId: 'gone' }),
      record({ alarmId: 'rang', state: 'fired', firedAt: 1 }),
      record({ kind: 'test', alarmId: 'native-test' }),
    ];
    expect(staleSavedAlarmIds(records, new Set(['kept']))).toEqual(['gone']);
  });
});
