import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  completionDeadline,
  createOccurrence,
  dismissOccurrence,
  expireOccurrence,
  followUpAt,
  isActive,
  markAlarmFired,
  markMissed,
  MISSED_AFTER_MS,
  recordSystemStop,
  shouldExpire,
  startMission,
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
  it('snapshots the alarm, including its accountability mode, and starts as scheduled', () => {
    expect(created).toMatchObject({
      id: 'occ-1',
      alarmId: 'alarm-1',
      scheduledAt: 1_000,
      source: 'simulated',
      fireEvidence: 'app',
      status: 'scheduled',
      alarmLabel: 'Subuh',
      mission: alarm.mission,
      snoozeMinutes: 10,
      completionMode: 'reward',
      gentleReminderMinutes: 10,
      startedAt: null,
      alarmStoppedAt: null,
      result: null,
    });
    expect(isActive(created)).toBe(true);
  });

  it('records snooze as null when snooze is off, and native evidence for native alarms', () => {
    const noSnooze = { ...alarm, snooze: { enabled: false, minutes: 5 as const } };
    expect(createOccurrence({ alarm: noSnooze, scheduledAt: 0, source: 'simulated', now: 0 }).snoozeMinutes).toBeNull();
    expect(createOccurrence({ alarm, scheduledAt: 0, source: 'native', now: 0 }).fireEvidence).toBe('system');
    expect(createOccurrence({ alarm, scheduledAt: 0, source: 'native', now: 0, fireEvidence: 'schedule' }).fireEvidence).toBe(
      'schedule',
    );
  });
});

describe('state transitions', () => {
  it('scheduled → alarm_fired → mission_in_progress → completed', () => {
    expect(started).toMatchObject({ status: 'alarm_fired', startedAt: 2_000 });
    expect(inMission).toMatchObject({
      status: 'mission_in_progress',
      missionStartedAt: 3_000,
      alarmStoppedAt: 3_000,
      alarmStopReason: 'mission',
    });

    const done = unwrap(completeMission(inMission, missionResult, 30_000));
    expect(done).toMatchObject({
      status: 'completed',
      missionCompletedAt: 30_000,
      endedAt: 30_000,
      result: { kind: 'mission_completed', mission: missionResult },
    });
    expect(isActive(done)).toBe(false);
  });

  it('can record the real fire time separately from now', () => {
    expect(unwrap(markAlarmFired(created, 9_000, 1_500))).toMatchObject({ startedAt: 1_500, updatedAt: 9_000 });
  });

  it('starting the mission again is a no-op', () => {
    expect(startMission(inMission, 9_000)).toEqual({ ok: true, occurrence: inMission });
  });

  it('rejects out-of-order steps', () => {
    expect(completeMission(started, missionResult, 5_000)).toEqual({ ok: false, error: 'invalid-transition' });
    expect(markAlarmFired(started, 5_000)).toEqual({ ok: false, error: 'invalid-transition' });
    expect(recordSystemStop(created, 5_000)).toEqual({ ok: false, error: 'invalid-transition' });
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
      alarmStopReason: 'turn_off',
      result: { kind: 'no_mission' },
    });
    // The phone's Stop control also completes a no-mission alarm.
    expect(unwrap(recordSystemStop(noMission, 3))).toMatchObject({
      status: 'completed',
      alarmStopReason: 'system',
      result: { kind: 'no_mission' },
    });
  });
});

describe('system Stop control', () => {
  const stopped = unwrap(recordSystemStop(started, 4_000));

  it('records the stop but keeps the morning open', () => {
    expect(stopped).toMatchObject({ status: 'alarm_fired', alarmStoppedAt: 4_000, alarmStopReason: 'system' });
    expect(isActive(stopped)).toBe(true);
    expect(recordSystemStop(stopped, 5_000)).toEqual({ ok: true, occurrence: stopped });
  });

  it('still allows the mission to be completed afterwards', () => {
    const late = unwrap(startMission(stopped, 6_000));
    expect(late).toMatchObject({ status: 'mission_in_progress', alarmStopReason: 'system', alarmStoppedAt: 4_000 });
    expect(unwrap(completeMission(late, missionResult, 9_000)).status).toBe('completed');
  });

  it('expires as dismissed (system) when the mission never happens', () => {
    expect(unwrap(expireOccurrence(stopped, 99_000))).toMatchObject({
      status: 'dismissed',
      result: { kind: 'system_dismiss' },
    });
  });
});

describe('dismiss and expiry', () => {
  it.each([
    ['ringing', started],
    ['mid-mission', inMission],
  ])('records an in-app dismiss while %s', (_, occurrence) => {
    const dismissed = unwrap(dismissOccurrence(occurrence, 7_000));
    expect(dismissed).toMatchObject({ status: 'dismissed', endedAt: 7_000, result: { kind: 'emergency_dismiss' } });
    expect(dismissed.missionCompletedAt).toBeNull();
  });

  it('expires an unanswered alarm as missed', () => {
    expect(unwrap(expireOccurrence(started, 99_000)).status).toBe('missed');
    expect(unwrap(expireOccurrence(inMission, 99_000))).toMatchObject({ status: 'missed', missionStartedAt: 3_000 });
  });

  it('closes reward and challenge mornings an hour after the alarm was due', () => {
    for (const mode of ['reward', 'challenge'] as const) {
      const o = { ...started, completionMode: mode };
      expect(completionDeadline(o)).toBe(1_000 + MISSED_AFTER_MS);
      expect(shouldExpire(o, 1_000 + MISSED_AFTER_MS)).toBe(false);
      expect(shouldExpire(o, 1_001 + MISSED_AFTER_MS)).toBe(true);
    }
  });

  it('gives gentle mornings until an hour after the follow-up', () => {
    const gentle = { ...unwrap(recordSystemStop(started, 4_000)), completionMode: 'gentle' as const, gentleReminderMinutes: 30 };
    expect(followUpAt(gentle)).toBe(4_000 + 30 * 60_000);
    expect(completionDeadline(gentle)).toBe(4_000 + 30 * 60_000 + MISSED_AFTER_MS);
    expect(shouldExpire(gentle, 1_001 + MISSED_AFTER_MS)).toBe(false);
  });
});

describe('finished occurrences cannot change', () => {
  const completed = unwrap(completeMission(inMission, missionResult, 30_000));
  const dismissed = unwrap(dismissOccurrence(started, 7_000));

  it('prevents completing twice, or completing after a dismiss', () => {
    expect(completeMission(completed, missionResult, 40_000)).toEqual({ ok: false, error: 'already-finished' });
    expect(completeMission(dismissed, missionResult, 8_000)).toEqual({ ok: false, error: 'already-finished' });
    expect(dismissOccurrence(completed, 40_000)).toEqual({ ok: false, error: 'already-finished' });
  });

  it('blocks every transition from every final status', () => {
    const finals = [completed, dismissed, unwrap(markMissed(started, 1)), unwrap(cancelOccurrence(created, 1))];
    for (const final of finals) {
      for (const result of [
        markAlarmFired(final, 1),
        recordSystemStop(final, 1),
        startMission(final, 1),
        completeMission(final, missionResult, 1),
        completeWithoutMission(final, 1),
        dismissOccurrence(final, 1),
        markMissed(final, 1),
        cancelOccurrence(final, 1),
      ]) {
        expect(result).toEqual({ ok: false, error: 'already-finished' });
      }
      expect(shouldExpire(final, Number.MAX_SAFE_INTEGER)).toBe(false);
    }
  });
});
