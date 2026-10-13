import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm, type AlarmDraft } from '@/features/alarms/alarm';
import {
  completeMission,
  createOccurrence,
  markAlarmFired,
  markMissed,
  startMission,
  type AlarmOccurrence,
  type TransitionResult,
} from '@/features/alarms/occurrence';
import type { MissionResult } from '@/features/missions/types';

import { buildToday, todayAlarmAction, xpToday } from './today';

/** Wednesday 14 Oct 2026, local time. */
const at = (hour: number, minute = 0, day = 14) => new Date(2026, 9, day, hour, minute).getTime();
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const alarm = (id: string, overrides: Partial<AlarmDraft>): Alarm => ({ ...createAlarmDraft(overrides), id, createdAt: 0, updatedAt: 0 });

const step = (r: TransitionResult) => {
  if (!r.ok) throw new Error(r.error);
  return r.occurrence;
};

/** Today's morning for an alarm that rang at its time. */
function rang(a: Alarm, outcome: 'completed' | 'missed' | 'open'): AlarmOccurrence {
  const due = at(a.hour, a.minute);
  const fired = step(markAlarmFired(createOccurrence({ alarm: a, scheduledAt: due, source: 'native', now: due, id: `o-${a.id}` }), due));
  if (outcome === 'missed') return step(markMissed(fired, due + 61 * 60_000));
  const started = step(startMission(fired, due + 60_000));
  if (outcome === 'open') return started;
  return step(completeMission(started, resultFor(a), due + 120_000));
}

/** A completed result of the alarm's own mission type (only that completes it). */
function resultFor(a: Alarm): MissionResult {
  const m = a.mission;
  if (m.type === 'quiz') {
    return { type: 'quiz', category: m.category, difficulty: m.difficulty, questionCount: 3, correctCount: 3, accuracy: 1, durationMs: 30_000, answers: [] };
  }
  if (m.type === 'fitness') {
    return {
      type: 'fitness',
      exercise: m.exercise,
      difficulty: m.difficulty,
      kind: 'reps',
      target: 10,
      achieved: 10,
      durationMs: 30_000,
      verification: 'self_reported',
    };
  }
  return { difficulty: 'easy', questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 30_000 };
}

const main = alarm('main', { hour: 7, minute: 0, weekdays: [...WEEKDAYS], isPrimary: true, label: 'Subuh' });
/** A one-off saved this morning (it rings at 12:30 today). */
const vocab = {
  ...alarm('vocab', {
    hour: 12,
    minute: 30,
    weekdays: [],
    mission: { type: 'quiz', category: 'vocabulary', difficulty: 'easy', questionCount: 3 },
  }),
  updatedAt: at(5),
};
const squats = alarm('squats', {
  hour: 18,
  minute: 0,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  mission: { type: 'fitness', exercise: 'squats', difficulty: 'easy' },
  completionMode: 'challenge',
});
const saturday = alarm('sat', { hour: 8, minute: 0, weekdays: [6] });
const off = alarm('off', { hour: 9, minute: 0, weekdays: [3], enabled: false });
const ALARMS = [squats, saturday, vocab, off, main];

describe('Today’s schedule', () => {
  it('shows the alarms that ring today, in time order (not other days, not turned-off alarms)', () => {
    const plan = buildToday({ alarms: ALARMS, occurrences: [], now: at(6) });
    expect(plan.schedule.map((i) => `${i.hour}:${i.minute} ${i.alarmId}`)).toEqual(['7:0 main', '12:30 vocab', '18:0 squats']);
    expect(plan.schedule.every((i) => i.status === 'upcoming')).toBe(true);
    expect(plan.schedule[0]).toMatchObject({ isMainWakeUp: true, label: 'Subuh', mode: 'reward' });
    expect(plan.schedule[2]).toMatchObject({ mode: 'challenge', mission: { type: 'fitness', exercise: 'squats' } });
  });

  it('a one-off alarm is on Today on its date only, and is never the next alarm once its time has passed', () => {
    expect(buildToday({ alarms: [vocab], occurrences: [], now: at(12, 0) }).schedule).toHaveLength(1);
    const later = buildToday({ alarms: [vocab], occurrences: [], now: at(13, 0) });
    expect(later.schedule.map((i) => i.status)).toEqual(['passed']);
    expect(later.next).toBeNull();
    expect(buildToday({ alarms: [vocab], occurrences: [], now: at(12, 0, 15) }).schedule).toHaveLength(0);
  });

  it('shows completed, missed and waiting mornings from what was recorded', () => {
    const done = buildToday({ alarms: ALARMS, occurrences: [rang(main, 'completed')], now: at(9) });
    expect(done.schedule[0]).toMatchObject({ alarmId: 'main', occurrenceId: 'o-main', status: 'completed' });
    expect(done.schedule).toHaveLength(3); // the recorded morning replaces the planned one

    expect(buildToday({ alarms: ALARMS, occurrences: [rang(main, 'missed')], now: at(9) }).schedule[0].status).toBe('missed');
    expect(buildToday({ alarms: ALARMS, occurrences: [rang(main, 'open')], now: at(7, 5) }).schedule[0].status).toBe('in_progress');
    // Time passed, nothing recorded on this phone.
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(19) }).schedule.map((i) => i.status)).toEqual(['passed', 'passed', 'passed']);
  });

  it('a one-off alarm is tagged while upcoming, and leaves Today once its one ring is done', () => {
    expect(buildToday({ alarms: [vocab], occurrences: [], now: at(12) }).schedule).toEqual([
      expect.objectContaining({ alarmId: 'vocab', oneOff: true, status: 'upcoming' }),
    ]);
    // Rang and finished: it turned itself off and its morning stays only in history.
    const off = { ...vocab, enabled: false };
    expect(buildToday({ alarms: [off], occurrences: [rang(vocab, 'completed')], now: at(13) }).schedule).toEqual([]);
    expect(buildToday({ alarms: [off], occurrences: [rang(vocab, 'missed')], now: at(14) }).schedule).toEqual([]);
    // Still waiting for its mission: it stays, so it can be finished.
    expect(buildToday({ alarms: [off], occurrences: [rang(vocab, 'open')], now: at(12, 35) }).schedule).toEqual([
      expect.objectContaining({ oneOff: true, status: 'in_progress' }),
    ]);
  });

  it('a Main Wake-Up with snoozes is ONE item (snoozes are never listed as alarms)', () => {
    const snoozy = { ...main, snooze: { enabled: true, minutes: 10 as const, maxSnoozes: 5 as const } };
    const plan = buildToday({ alarms: [snoozy], occurrences: [], now: at(6) });
    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0]).toMatchObject({ isMainWakeUp: true, oneOff: false, snooze: { minutes: 10, maxSnoozes: 5 } });
    // Its morning, once rung, is still one item.
    expect(buildToday({ alarms: [snoozy], occurrences: [rang(snoozy, 'completed')], now: at(9) }).schedule).toHaveLength(1);
    // Snooze off: no snooze summary.
    const noSnooze = { ...main, snooze: { ...main.snooze, enabled: false } };
    expect(buildToday({ alarms: [noSnooze], occurrences: [], now: at(6) }).schedule[0].snooze).toBeNull();
  });

  it('ignores mornings from other days', () => {
    const yesterday = { ...rang(main, 'completed'), scheduledAt: at(7, 0, 13) };
    expect(buildToday({ alarms: ALARMS, occurrences: [yesterday], now: at(6) }).schedule[0].status).toBe('upcoming');
  });

  it('no alarms: an empty schedule, no next alarm and no Main Wake-Up', () => {
    expect(buildToday({ alarms: [], occurrences: [], now: at(6) })).toEqual({ schedule: [], next: null, morning: { kind: 'no_main' } });
  });
});

describe('next alarm', () => {
  it('comes from the real schedule, never a placeholder', () => {
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(6) }).next).toEqual({ alarmId: 'main', at: at(7) });
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(12) }).next).toEqual({ alarmId: 'vocab', at: at(12, 30) });
    // After the last one today: tomorrow's Main Wake-Up.
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(19) }).next).toEqual({ alarmId: 'main', at: at(7, 0, 15) });
  });
});

describe('Main Wake-Up status (the only alarm that decides the morning)', () => {
  it('before it rings: Morning ahead, with its time', () => {
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(6) }).morning).toEqual({ kind: 'ahead', hour: 7, minute: 0 });
  });

  it('after a completed mission: Morning complete', () => {
    expect(buildToday({ alarms: ALARMS, occurrences: [rang(main, 'completed')], now: at(9) }).morning).toEqual({ kind: 'complete' });
  });

  it('rang and waiting; missed; or no response recorded', () => {
    expect(buildToday({ alarms: ALARMS, occurrences: [rang(main, 'open')], now: at(7, 5) }).morning).toEqual({
      kind: 'in_progress',
      occurrenceId: 'o-main',
    });
    expect(buildToday({ alarms: ALARMS, occurrences: [rang(main, 'missed')], now: at(9) }).morning).toMatchObject({ kind: 'not_complete' });
    expect(buildToday({ alarms: ALARMS, occurrences: [], now: at(9) }).morning).toMatchObject({
      kind: 'not_complete',
      summary: 'No response recorded',
    });
  });

  it('other alarms never decide the morning', () => {
    const plan = buildToday({ alarms: ALARMS, occurrences: [rang(squats, 'completed')], now: at(6) });
    expect(plan.morning).toEqual({ kind: 'ahead', hour: 7, minute: 0 });
  });

  it('no Main Wake-Up Alarm, or it doesn’t ring today', () => {
    expect(buildToday({ alarms: [vocab, squats], occurrences: [], now: at(6) }).morning).toEqual({ kind: 'no_main' });
    const weekendMain = alarm('wk', { hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
    expect(buildToday({ alarms: [weekendMain], occurrences: [], now: at(6) }).morning).toEqual({
      kind: 'not_today',
      nextAt: at(8, 0, 17),
    });
  });
});

describe('progress snapshot', () => {
  it('XP today counts only what was earned today', () => {
    const ledger = [
      { amount: 12, earnedAt: at(7, 3) },
      { amount: 5, earnedAt: at(7, 3) },
      { amount: 10, earnedAt: at(7, 0, 13) },
    ];
    expect(xpToday(ledger, at(9))).toBe(17);
    expect(xpToday([], at(9))).toBe(0);
  });
});

describe('Today row action (todayAlarmAction): resume only a mission that can still be finished', () => {
  it.each(['reward', 'gentle', 'challenge'] as const)('%s: rang, mission waiting, within its window → resume the mission', (mode) => {
    const a = { ...main, completionMode: mode };
    const plan = buildToday({ alarms: [a], occurrences: [rang(a, 'open')], now: at(7, 5) });
    expect(plan.schedule[0]).toMatchObject({ status: 'in_progress', action: { kind: 'resume_mission', occurrenceId: 'o-main' } });
  });

  it('completed → edit; not rung yet → edit', () => {
    const done = buildToday({ alarms: [main], occurrences: [rang(main, 'completed')], now: at(9) });
    expect(done.schedule[0].action).toEqual({ kind: 'edit_alarm', alarmId: 'main' });
    const upcoming = buildToday({ alarms: [main], occurrences: [], now: at(6) });
    expect(upcoming.schedule[0].action).toEqual({ kind: 'edit_alarm', alarmId: 'main' });
  });

  it('Reward: resumable until 09:00 (2 hours), not after; then it opens the alarm and says Not completed', () => {
    const open = rang(main, 'open');
    expect(buildToday({ alarms: [main], occurrences: [open], now: at(8, 59) }).schedule[0].action.kind).toBe('resume_mission');
    const late = buildToday({ alarms: [main], occurrences: [open], now: at(9, 1) });
    expect(late.schedule[0]).toMatchObject({ status: 'not_completed', action: { kind: 'edit_alarm' } });
    expect(late.morning).toEqual({ kind: 'not_complete', summary: 'Mission not completed' });
  });

  it('Gentle: resumable in the evening, not the next day', () => {
    const gentle = { ...main, completionMode: 'gentle' as const };
    const open = rang(gentle, 'open');
    expect(buildToday({ alarms: [gentle], occurrences: [open], now: at(21) }).schedule[0].action.kind).toBe('resume_mission');
    expect(todayAlarmAction(gentle, open, at(0, 5, 15))).toEqual({ kind: 'edit_alarm', alarmId: 'main' });
  });

  it('a deleted alarm never resumes (no saved alarm: no row, nothing to tap)', () => {
    expect(todayAlarmAction(null, rang(main, 'open'), at(7, 5))).toEqual({ kind: 'none' });
    expect(buildToday({ alarms: [], occurrences: [rang(main, 'open')], now: at(7, 5) }).schedule).toEqual([]);
  });

  it('an alarm without a mission opens the alarm', () => {
    const plain = { ...main, mission: { type: 'none' as const } };
    const due = at(7);
    const fired = step(markAlarmFired(createOccurrence({ alarm: plain, scheduledAt: due, source: 'native', now: due }), due));
    expect(todayAlarmAction(plain, fired, at(7, 5)).kind).toBe('edit_alarm');
  });
});

describe('Today is built from SAVED alarms; occurrences only add state (no ghost rows)', () => {
  it('completed at 07:00, deleted at 10:00: the row leaves Today (its morning stays in history)', () => {
    const done = rang(main, 'completed');
    expect(buildToday({ alarms: [main], occurrences: [done], now: at(9, 59) }).schedule).toHaveLength(1);
    const after = buildToday({ alarms: [], occurrences: [done], now: at(10) });
    expect(after.schedule).toEqual([]);
    expect(after.next).toBeNull();
  });

  it('a turned-off alarm leaves Today and Next alarm, even if it rang this morning', () => {
    const offNow = { ...main, enabled: false };
    const plan = buildToday({ alarms: [offNow], occurrences: [rang(main, 'completed')], now: at(9) });
    expect(plan.schedule).toEqual([]);
    expect(plan.next).toBeNull();
  });

  it('a mission still waiting stays on its row even after the alarm’s time was edited', () => {
    const moved = { ...main, hour: 8 };
    const plan = buildToday({ alarms: [moved], occurrences: [rang(main, 'open')], now: at(7, 10) });
    expect(plan.schedule).toEqual([expect.objectContaining({ alarmId: 'main', hour: 7, status: 'in_progress' })]);
  });

  it('the label shown is the saved alarm’s current label', () => {
    const renamed = { ...main, label: 'Fajr' };
    expect(buildToday({ alarms: [renamed], occurrences: [rang(main, 'completed')], now: at(9) }).schedule[0].label).toBe('Fajr');
  });
});

describe('at most ONE Main Wake-Up for a date', () => {
  it('even if older data has two Main Wake-Ups on the same day', () => {
    const second = alarm('main2', { hour: 7, minute: 15, weekdays: [...WEEKDAYS], isPrimary: true });
    const plan = buildToday({ alarms: [main, second], occurrences: [], now: at(6) });
    expect(plan.schedule.filter((i) => i.isMainWakeUp).map((i) => i.alarmId)).toEqual(['main']);
  });

  it('weekday and weekend Main Wake-Ups: only the one for today', () => {
    const weekend = alarm('weekend', { hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
    const wednesday = buildToday({ alarms: [main, weekend], occurrences: [], now: at(6) });
    expect(wednesday.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['main', true]]);
    const saturday = buildToday({ alarms: [main, weekend], occurrences: [], now: at(6, 0, 17) });
    expect(saturday.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['weekend', true]]);
    expect(saturday.morning).toEqual({ kind: 'ahead', hour: 8, minute: 0 });
  });

  it('a one-off date override: it is today’s Main Wake-Up; the usual one still shows, not as Main Wake-Up', () => {
    const override = { ...alarm('once', { hour: 7, minute: 30, weekdays: [], isPrimary: true }), updatedAt: at(5) };
    const plan = buildToday({ alarms: [main, override], occurrences: [], now: at(6) });
    expect(plan.schedule.map((i) => [i.alarmId, i.isMainWakeUp, i.oneOff])).toEqual([
      ['main', false, false],
      ['once', true, true],
    ]);
    expect(plan.morning).toEqual({ kind: 'ahead', hour: 7, minute: 30 });
  });

  it('ROOT CAUSE (fixed): after “Replace”, the new alarm is tagged at once, even if the old one already rang today', () => {
    // Alarm 1 rang at 07:00 today (its morning was recorded as the Main Wake-Up), then the
    // user made Alarm 2 the Main Wake-Up for the same days; Alarm 1 was deleted.
    const alarm2 = { ...alarm('alarm2', { hour: 9, minute: 30, weekdays: [...WEEKDAYS], isPrimary: true }), updatedAt: at(8) };
    const plan = buildToday({ alarms: [alarm2], occurrences: [rang(main, 'completed')], now: at(8, 5) });
    expect(plan.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['alarm2', true]]);
    expect(plan.morning).toEqual({ kind: 'ahead', hour: 9, minute: 30 });
  });

  it('partial replacement: Wednesday’s Main Wake-Up is the new alarm; the old one keeps its other days', () => {
    const old = { ...main, weekdays: [1, 2, 4, 5] as Alarm['weekdays'] };
    const wed = { ...alarm('wed', { hour: 7, minute: 30, weekdays: [3], isPrimary: true }), updatedAt: at(5) };
    const plan = buildToday({ alarms: [old, wed], occurrences: [], now: at(6) });
    expect(plan.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['wed', true]]);
    const thursday = buildToday({ alarms: [old, wed], occurrences: [], now: at(6, 0, 15) });
    expect(thursday.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['main', true]]);
  });

  it('a one-off Main Wake-Up that rang (and turned itself off) still owns its date', () => {
    const once = { ...alarm('once', { hour: 6, minute: 30, weekdays: [], isPrimary: true }), updatedAt: at(5) };
    const plan = buildToday({ alarms: [main, { ...once, enabled: false }], occurrences: [rang(once, 'completed')], now: at(6, 45) });
    expect(plan.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['main', false]]);
  });
});
