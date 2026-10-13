import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm, type CompletionMode } from './alarm';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { createOccurrenceManager, OccurrenceError } from './occurrence-manager';
import { canResumeMission, missionCompletionDeadline, missionResumeState, MISSION_WINDOW_MS, shouldExpire } from './completion-policy';
import {
  completeMission,
  createOccurrence,
  markAlarmFired,
  recordSnoozes,
  recordSystemStop,
  startMission,
  type AlarmOccurrence,
  type TransitionResult,
} from './occurrence';

const step = (r: TransitionResult) => {
  if (!r.ok) throw new Error(r.error);
  return r.occurrence;
};

/** Wednesday 14 Oct 2026, local time. */
const at = (hour: number, minute = 0, day = 14) => new Date(2026, 9, day, hour, minute).getTime();
const MIN = 60_000;

const alarmIn = (mode: CompletionMode, o: Partial<Alarm> = {}): Alarm => ({
  ...createAlarmDraft({ completionMode: mode, mission: { type: 'math', difficulty: 'easy', questionCount: 3 }, hour: 7, minute: 0 }),
  id: `a-${mode}`,
  createdAt: 0,
  updatedAt: 0,
  ...o,
});

/** A morning that rang at 07:00 and is waiting for its mission. */
function waiting(mode: CompletionMode, o: Partial<Alarm> = {}): AlarmOccurrence {
  const a = alarmIn(mode, o);
  const due = at(a.hour, a.minute);
  return step(markAlarmFired(createOccurrence({ alarm: a, scheduledAt: due, source: 'native', now: due, id: `o-${mode}` }), due));
}

describe('completion windows (one central policy)', () => {
  it('Reward: up to 2 hours after the alarm (not indefinite)', () => {
    const o = waiting('reward');
    expect(MISSION_WINDOW_MS.reward).toBe(120 * MIN);
    expect(missionCompletionDeadline(o)).toBe(at(9));
    expect(canResumeMission(o, at(8, 59))).toBe(true);
    expect(canResumeMission(o, at(9))).toBe(true);
    expect(canResumeMission(o, at(9) + 1)).toBe(false);
    expect(shouldExpire(o, at(9) + 1)).toBe(true);
    expect(canResumeMission(o, at(15))).toBe(false);
  });

  it('Gentle: the rest of the same local calendar day, not after midnight', () => {
    const o = waiting('gentle', { gentleReminderMinutes: 10 });
    expect(canResumeMission(o, at(7, 30))).toBe(true);
    expect(canResumeMission(o, at(18))).toBe(true);
    expect(canResumeMission(o, at(23, 59))).toBe(true);
    expect(canResumeMission(o, at(0, 0, 15))).toBe(false);
    expect(missionCompletionDeadline(o)).toBe(at(0, 0, 15) - 1);
  });

  it('Gentle: the follow-up reminder doesn’t set the deadline (a later follow-up changes nothing)', () => {
    const short = waiting('gentle', { gentleReminderMinutes: 5 });
    const long = { ...short, gentleReminderMinutes: 60 };
    expect(missionCompletionDeadline(short)).toBe(missionCompletionDeadline(long));
  });

  it('Challenge keeps its stricter 1-hour window', () => {
    const o = waiting('challenge');
    expect(missionCompletionDeadline(o)).toBe(at(8));
    expect(canResumeMission(o, at(8) + 1)).toBe(false);
  });

  it('snoozing extends Reward and Challenge by the time spent snoozing', () => {
    const o = step(recordSnoozes({ ...waiting('reward'), snoozeMinutes: 10 }, 3, at(7, 30)));
    expect(missionCompletionDeadline(o)).toBe(at(9, 30));
  });

  it('a mode can be passed in (e.g. to show what a different mode would allow)', () => {
    const o = waiting('reward');
    expect(missionCompletionDeadline(o, 'challenge')).toBe(at(8));
  });
});

describe('resume state', () => {
  it('not rung / waiting / completed / expired / no mission', () => {
    const a = alarmIn('reward');
    const scheduled = createOccurrence({ alarm: a, scheduledAt: at(7), source: 'native', now: at(6) });
    expect(missionResumeState(scheduled, at(6, 30))).toBe('not_rung');
    const o = waiting('reward');
    expect(missionResumeState(o, at(7, 5))).toBe('resumable');
    const started = step(startMission(o, at(7, 6)));
    expect(missionResumeState(started, at(7, 30))).toBe('resumable');
    const done = step(
      completeMission(started, { difficulty: 'easy', questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 1 }, at(7, 10)),
    );
    expect(missionResumeState(done, at(7, 30))).toBe('completed');
    expect(missionResumeState(o, at(10))).toBe('expired');
    const plain = step(
      markAlarmFired(createOccurrence({ alarm: { ...a, mission: { type: 'none' } }, scheduledAt: at(7), source: 'native', now: at(7) }), at(7)),
    );
    expect(missionResumeState(plain, at(7, 5))).toBe('no_mission');
    expect(canResumeMission(plain, at(7, 5))).toBe(false);
  });

  it('stopping the alarm with the phone keeps the mission resumable', () => {
    const stopped = step(recordSystemStop(waiting('reward'), at(7, 1)));
    expect(canResumeMission(stopped, at(8))).toBe(true);
  });
});

describe('the occurrence manager follows the policy', () => {
  function setup(start: number) {
    const clock = { time: start };
    const repository = createMemoryOccurrenceRepository();
    return { clock, repository, manager: createOccurrenceManager(async () => repository, () => clock.time) };
  }

  it('opening a morning after its window shows it closed; finishing it late is refused', async () => {
    const { clock, manager, repository } = setup(at(7, 5));
    const o = waiting('reward');
    await repository.insert(o);
    expect((await manager.get(o.id))?.status).toBe('alarm_fired');
    clock.time = at(9, 1);
    await expect(manager.startMission(o.id)).rejects.toEqual(new OccurrenceError('already-finished'));
    expect((await manager.get(o.id))?.status).toBe('missed');
  });

  it('a Gentle morning can still be finished in the evening', async () => {
    const { clock, manager, repository } = setup(at(7, 5));
    const o = waiting('gentle');
    await repository.insert(o);
    clock.time = at(20);
    expect((await manager.startMission(o.id)).status).toBe('mission_in_progress');
  });
});
