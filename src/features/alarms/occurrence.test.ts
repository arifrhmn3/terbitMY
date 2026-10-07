import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  createOccurrence,
  dismissOccurrence,
  isActive,
  isSuccessfulMorning,
  markMissed,
  morningOutcome,
  MISSED_AFTER_MS,
  shouldMarkMissed,
  startMission,
  markAlarmFired,
  type AlarmOccurrence,
  type TransitionResult,
} from './occurrence';
import type { MathMissionResult } from '@/features/missions/math/session';

const alarm: Alarm = {
  ...createAlarmDraft({ label: 'Subuh', snooze: { enabled: true, minutes: 10 } }),
  id: 'alarm-1',
  createdAt: 0,
  updatedAt: 0,
};

const missionResult: MathMissionResult = {
  difficulty: 'easy',
  questionCount: 3,
  attempts: 4,
  wrongAttempts: 1,
  accuracy: 0.75,
  durationMs: 20_000,
};

function unwrap(result: TransitionResult): AlarmOccurrence {
  if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
  return result.occurrence;
}

const created = createOccurrence({ alarm, scheduledAt: 1_000, source: 'simulated', now: 1_000, id: 'occ-1' });
const started = unwrap(markAlarmFired(created, 2_000));
const inMission = unwrap(startMission(started, 3_000));

describe('createOccurrence', () => {
  it('snapshots the alarm and starts as scheduled', () => {
    expect(created).toMatchObject({
      id: 'occ-1',
      alarmId: 'alarm-1',
      scheduledAt: 1_000,
      source: 'simulated',
      status: 'scheduled',
      alarmLabel: 'Subuh',
      mission: alarm.mission,
      snoozeMinutes: 10,
      startedAt: null,
      result: null,
    });
    expect(isActive(created)).toBe(true);
  });

  it('records snooze as null when snooze is off', () => {
    const noSnooze = { ...alarm, snooze: { enabled: false, minutes: 5 as const } };
    expect(createOccurrence({ alarm: noSnooze, scheduledAt: 0, source: 'simulated', now: 0 }).snoozeMinutes).toBeNull();
  });
});

describe('state transitions', () => {
  it('scheduled → started → mission_in_progress → completed', () => {
    expect(started).toMatchObject({ status: 'alarm_fired', startedAt: 2_000 });
    expect(inMission).toMatchObject({ status: 'mission_in_progress', missionStartedAt: 3_000 });

    const done = unwrap(completeMission(inMission, missionResult, 30_000));
    expect(done).toMatchObject({
      status: 'completed',
      missionCompletedAt: 30_000,
      endedAt: 30_000,
      result: { kind: 'mission_completed', mission: missionResult },
    });
    expect(isActive(done)).toBe(false);
  });

  it('starting the mission again is a no-op', () => {
    const again = startMission(inMission, 9_000);
    expect(again).toEqual({ ok: true, occurrence: inMission });
  });

  it('cannot complete a mission that has not started', () => {
    expect(completeMission(started, missionResult, 5_000)).toEqual({ ok: false, error: 'invalid-transition' });
  });

  it('cannot start an alarm twice', () => {
    expect(markAlarmFired(started, 5_000)).toEqual({ ok: false, error: 'invalid-transition' });
  });

  it('requires the mission when the alarm has one', () => {
    expect(completeWithoutMission(started, 5_000)).toEqual({ ok: false, error: 'mission-required' });
  });

  it('completes an alarm without a mission', () => {
    const noMission = unwrap(
      markAlarmFired(
        createOccurrence({ alarm: { ...alarm, mission: { type: 'none' } }, scheduledAt: 0, source: 'simulated', now: 0 }),
        1,
      ),
    );
    expect(startMission(noMission, 2)).toEqual({ ok: false, error: 'no-mission' });
    expect(unwrap(completeWithoutMission(noMission, 2))).toMatchObject({
      status: 'completed',
      result: { kind: 'no_mission' },
    });
  });
});

describe('dismiss flow', () => {
  it.each([
    ['ringing', started],
    ['mid-mission', inMission],
  ])('records dismissed when dismissed while %s', (_, occurrence) => {
    const dismissed = unwrap(dismissOccurrence(occurrence, 7_000));
    expect(dismissed).toMatchObject({ status: 'dismissed', endedAt: 7_000, result: { kind: 'emergency_dismiss' } });
    expect(dismissed.missionCompletedAt).toBeNull();
  });
});

describe('finished occurrences cannot change', () => {
  const completed = unwrap(completeMission(inMission, missionResult, 30_000));
  const dismissed = unwrap(dismissOccurrence(started, 7_000));

  it('prevents completing twice', () => {
    expect(completeMission(completed, missionResult, 40_000)).toEqual({ ok: false, error: 'already-finished' });
  });

  it('prevents completing after a dismiss, and dismissing after completion', () => {
    expect(completeMission(dismissed, missionResult, 8_000)).toEqual({ ok: false, error: 'already-finished' });
    expect(dismissOccurrence(completed, 40_000)).toEqual({ ok: false, error: 'already-finished' });
  });

  it('blocks every transition from every final status', () => {
    const finals = [
      completed,
      dismissed,
      unwrap(markMissed(started, 1)),
      unwrap(cancelOccurrence(created, 1)),
    ];
    for (const final of finals) {
      for (const result of [
        markAlarmFired(final, 1),
        startMission(final, 1),
        completeMission(final, missionResult, 1),
        completeWithoutMission(final, 1),
        dismissOccurrence(final, 1),
        markMissed(final, 1),
        cancelOccurrence(final, 1),
      ]) {
        expect(result).toEqual({ ok: false, error: 'already-finished' });
      }
    }
  });
});

describe('shouldMarkMissed', () => {
  it('only marks active occurrences that are over an hour old', () => {
    expect(shouldMarkMissed(started, 1_000 + MISSED_AFTER_MS)).toBe(false);
    expect(shouldMarkMissed(started, 1_001 + MISSED_AFTER_MS)).toBe(true);
    const done = unwrap(dismissOccurrence(started, 2));
    expect(shouldMarkMissed(done, 1_001 + MISSED_AFTER_MS)).toBe(false);
  });
});

describe('accountability outcomes', () => {
  const noMissionAlarm = { ...alarm, mission: { type: 'none' as const } };
  const noMissionFired = unwrap(
    markAlarmFired(createOccurrence({ alarm: noMissionAlarm, scheduledAt: 0, source: 'simulated', now: 0 }), 1),
  );

  it('counts only a completed mission as a successful morning', () => {
    const done = unwrap(completeMission(inMission, missionResult, 30_000));
    expect(morningOutcome(done)).toBe('mission_completed');
    expect(isSuccessfulMorning(done)).toBe(true);

    const noMission = unwrap(completeWithoutMission(noMissionFired, 2));
    expect(morningOutcome(noMission)).toBe('completed_without_mission');
    expect(isSuccessfulMorning(noMission)).toBe(false);
  });

  it('separates dismissed-before-mission from mission-abandoned', () => {
    expect(morningOutcome(unwrap(dismissOccurrence(started, 5_000)))).toBe('dismissed_without_mission');
    expect(morningOutcome(unwrap(dismissOccurrence(inMission, 5_000)))).toBe('mission_abandoned');
    expect(morningOutcome(unwrap(markMissed(inMission, 5_000)))).toBe('mission_abandoned');
    expect(morningOutcome(unwrap(markMissed(started, 5_000)))).toBe('missed');
    expect(morningOutcome(unwrap(cancelOccurrence(started, 5_000)))).toBe('cancelled');
    expect(morningOutcome(started)).toBe('in_progress');
  });

  it('records a stop from the phone’s own controls as a system dismiss', () => {
    const stopped = unwrap(dismissOccurrence(started, 5_000, 'system'));
    expect(stopped).toMatchObject({ status: 'dismissed', result: { kind: 'system_dismiss' } });
    expect(isSuccessfulMorning(stopped)).toBe(false);
  });

  it('never counts an unfinished, dismissed or missed morning as successful', () => {
    for (const o of [
      started,
      inMission,
      unwrap(dismissOccurrence(started, 1)),
      unwrap(dismissOccurrence(inMission, 1, 'system')),
      unwrap(markMissed(started, 1)),
    ]) {
      expect(isSuccessfulMorning(o)).toBe(false);
    }
  });
});
