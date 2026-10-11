import { describe, expect, it } from '@jest/globals';

import { evaluateMorning, isRewardEligible, isStreakEligible, MODE_POLICIES, type ModePolicy } from './accountability';
import { COMPLETION_MODES, createAlarmDraft, type Alarm, type CompletionMode } from './alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  createOccurrence,
  dismissOccurrence,
  expireOccurrence,
  markAlarmFired,
  recordSystemStop,
  startMission,
  type AlarmOccurrence,
  type TransitionResult,
} from './occurrence';

const mission = { difficulty: 'easy' as const, questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 9_000 };

function unwrap(result: TransitionResult): AlarmOccurrence {
  if (!result.ok) throw new Error(result.error);
  return result.occurrence;
}

function fired(mode: CompletionMode, overrides: Partial<Alarm> = {}): AlarmOccurrence {
  const alarm: Alarm = { ...createAlarmDraft({ completionMode: mode, gentleReminderMinutes: 15, ...overrides }), id: 'a', createdAt: 0, updatedAt: 0 };
  return unwrap(markAlarmFired(createOccurrence({ alarm, scheduledAt: 1_000, source: 'native', now: 1_000 }), 1_000));
}

const scenarios = (mode: CompletionMode) => {
  const ringing = fired(mode);
  const systemStopped = unwrap(recordSystemStop(ringing, 2_000));
  const inMission = unwrap(startMission(ringing, 2_000));
  return {
    ringing,
    systemStopped,
    inMission,
    completed: unwrap(completeMission(inMission, mission, 5_000)),
    completedAfterSystemStop: unwrap(completeMission(unwrap(startMission(systemStopped, 3_000)), mission, 6_000)),
    systemStopNoMission: unwrap(expireOccurrence(systemStopped, 9_999_999)),
    skippedInApp: unwrap(dismissOccurrence(ringing, 2_500)),
    abandonedDismiss: unwrap(dismissOccurrence(inMission, 3_000)),
    abandonedTimeout: unwrap(expireOccurrence(inMission, 9_999_999)),
    unanswered: unwrap(expireOccurrence(ringing, 9_999_999)),
    cancelled: unwrap(cancelOccurrence(ringing, 2_000)),
  };
};

describe('evaluateMorning: outcomes are kept separate', () => {
  const s = scenarios('reward');

  it.each([
    ['ringing', s.ringing, 'ringing', 'not_started', 'Alarm ringing'],
    ['stopped by phone, mission open', s.systemStopped, 'stopped_by_system', 'not_started', 'Alarm stopped, mission not done yet'],
    ['mission in progress', s.inMission, 'stopped_for_mission', 'in_progress', 'Mission in progress'],
    ['mission completed', s.completed, 'stopped_for_mission', 'completed', 'Mission completed'],
    ['completed after phone stop', s.completedAfterSystemStop, 'stopped_by_system', 'completed', 'Mission completed'],
    ['phone stop, mission never done', s.systemStopNoMission, 'stopped_by_system', 'skipped', 'Stopped with phone controls · Mission not done'],
    ['skipped in app', s.skippedInApp, 'dismissed_in_app', 'skipped', 'Dismissed in Terbit MY · Mission not done'],
    ['abandoned (dismissed mid-mission)', s.abandonedDismiss, 'stopped_for_mission', 'abandoned', 'Mission abandoned'],
    ['abandoned (timed out mid-mission)', s.abandonedTimeout, 'stopped_for_mission', 'abandoned', 'Mission abandoned'],
    ['unanswered', s.unanswered, 'unanswered', 'skipped', 'Missed (no response recorded)'],
    ['cancelled', s.cancelled, 'cancelled', 'not_started', 'Cancelled'],
  ])('%s', (_, occurrence, alarmOutcome, missionOutcome, summary) => {
    expect(evaluateMorning(occurrence)).toMatchObject({ alarmOutcome, missionOutcome, summary });
  });

  it('marks iOS schedule-based alarms as "went off" rather than ringing', () => {
    const ios = { ...s.ringing, fireEvidence: 'schedule' as const };
    expect(evaluateMorning(ios)).toMatchObject({ alarmOutcome: 'fired', summary: 'Alarm went off' });
  });
});

describe('reward and streak eligibility', () => {
  for (const mode of COMPLETION_MODES) {
    describe(`${mode} mode`, () => {
      const s = scenarios(mode);

      it('only a completed mission is eligible, even after a phone stop', () => {
        expect(isRewardEligible(s.completed)).toBe(true);
        expect(isStreakEligible(s.completed)).toBe(true);
        expect(isRewardEligible(s.completedAfterSystemStop)).toBe(true);
      });

      it('a phone stop before the mission earns nothing', () => {
        for (const o of [s.systemStopped, s.systemStopNoMission]) {
          expect(isRewardEligible(o)).toBe(false);
          expect(isStreakEligible(o)).toBe(false);
        }
      });

      it('abandoning, skipping, missing or cancelling earns nothing', () => {
        for (const o of [s.inMission, s.abandonedDismiss, s.abandonedTimeout, s.skippedInApp, s.unanswered, s.cancelled]) {
          expect(isRewardEligible(o)).toBe(false);
          expect(isStreakEligible(o)).toBe(false);
        }
      });

      it('morningComplete only when finished successfully', () => {
        expect(evaluateMorning(s.completed).morningComplete).toBe(true);
        expect(evaluateMorning(s.systemStopNoMission).morningComplete).toBe(false);
      });
    });
  }

  it('an alarm without a mission never earns mission rewards', () => {
    const noMission = unwrap(completeWithoutMission(fired('reward', { mission: { type: 'none' } }), 2_000));
    expect(evaluateMorning(noMission)).toMatchObject({
      missionOutcome: 'not_required',
      morningComplete: true,
      rewardEligible: false,
      streakEligible: false,
      summary: 'Alarm turned off (no mission)',
    });
  });

  it('uses the mode passed in, so policies can be compared without changing data', () => {
    const s = scenarios('reward');
    const lenient: Record<CompletionMode, ModePolicy> = {
      ...MODE_POLICIES,
      gentle: { ...MODE_POLICIES.gentle, streak: 'alarm_answered' },
    };
    // Same stored morning, judged under a hypothetical Gentle policy where answering the alarm keeps a streak.
    expect(isStreakEligible(s.systemStopNoMission, 'gentle', lenient)).toBe(true);
    expect(isRewardEligible(s.systemStopNoMission, 'gentle', lenient)).toBe(false);
    expect(isStreakEligible(s.unanswered, 'gentle', lenient)).toBe(false);
    expect(isStreakEligible(s.systemStopNoMission)).toBe(false);
  });
});

describe('mode-specific behaviour', () => {
  it('challenge mode leads with the mission and labels incomplete mornings', () => {
    expect(MODE_POLICIES.challenge.missionFirst).toBe(true);
    expect(MODE_POLICIES.reward.missionFirst).toBe(false);
    expect(evaluateMorning(scenarios('challenge').systemStopNoMission).summary).toBe(
      'Stopped with phone controls · Challenge incomplete',
    );
  });

  it('gentle mode has a follow-up time while the mission is open, and none once it is done', () => {
    const s = scenarios('gentle');
    expect(evaluateMorning(s.systemStopped).followUpAt).toBe(2_000 + 15 * 60_000);
    expect(evaluateMorning(s.ringing).followUpAt).toBe(1_000 + 15 * 60_000);
    expect(evaluateMorning(s.completed).followUpAt).toBeNull();
    expect(evaluateMorning(scenarios('reward').systemStopped).followUpAt).toBeNull();
  });
});
