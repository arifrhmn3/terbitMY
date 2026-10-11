import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { gentleReminderId, planGentleReminders } from './gentle-reminders';
import {
  completeMission,
  createOccurrence,
  markAlarmFired,
  recordSystemStop,
  startMission,
  type AlarmOccurrence,
  type TransitionResult,
} from './occurrence';

const unwrap = (r: TransitionResult): AlarmOccurrence => {
  if (!r.ok) throw new Error(r.error);
  return r.occurrence;
};

function fired(id: string, overrides: Partial<Alarm>): AlarmOccurrence {
  const alarm: Alarm = { ...createAlarmDraft(overrides), id: 'alarm-' + id, createdAt: 0, updatedAt: 0 };
  return unwrap(markAlarmFired(createOccurrence({ alarm, scheduledAt: 1_000, source: 'native', now: 1_000, id }), 1_000));
}

describe('Gentle reminders', () => {
  it('schedules a reminder at the configured delay after the alarm stops', () => {
    const gentle = unwrap(recordSystemStop(fired('g', { completionMode: 'gentle', gentleReminderMinutes: 15, label: 'Subuh' }), 2_000));
    const plan = planGentleReminders([gentle], 3_000);
    expect(plan.schedule).toEqual([
      {
        id: 'gentle-g',
        title: 'Subuh: mission waiting',
        body: 'Open Terbit MY to finish this morning’s mission.',
        fireAt: 2_000 + 15 * 60_000,
      },
    ]);
    expect(plan.cancel).toEqual([]);
  });

  it.each([5, 10, 15] as const)('uses the alarm’s own delay (%i minutes)', (minutes) => {
    const o = unwrap(recordSystemStop(fired('x', { completionMode: 'gentle', gentleReminderMinutes: minutes }), 2_000));
    expect(planGentleReminders([o], 2_000).schedule[0].fireAt).toBe(2_000 + minutes * 60_000);
  });

  it('cancels reminders for finished, overdue or non-Gentle mornings', () => {
    const gentle = fired('done', { completionMode: 'gentle' });
    const done = unwrap(
      completeMission(unwrap(startMission(gentle, 2_000)), {
        difficulty: 'easy',
        questionCount: 3,
        attempts: 3,
        wrongAttempts: 0,
        accuracy: 1,
        durationMs: 1,
      }, 3_000),
    );
    const reward = fired('reward', { completionMode: 'reward' });
    const overdue = fired('late', { completionMode: 'gentle', gentleReminderMinutes: 5 });
    const plan = planGentleReminders([done, reward, overdue], 1_000 + 6 * 60_000);
    expect(plan.schedule).toEqual([]);
    expect(plan.cancel).toEqual([gentleReminderId('done'), gentleReminderId('reward'), gentleReminderId('late')]);
  });
});
