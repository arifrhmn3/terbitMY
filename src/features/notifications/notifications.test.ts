import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAlarmDraft, type Alarm, type CompletionMode } from '@/features/alarms/alarm';
import { planGentleReminders } from '@/features/alarms/gentle-reminders';
import { createOccurrence, markAlarmFired, recordSystemStop, type AlarmOccurrence, type TransitionResult } from '@/features/alarms/occurrence';

import { NOTIFICATIONS } from './notification-catalogue';

const root = join(__dirname, '..', '..', '..');

const unwrap = (r: TransitionResult): AlarmOccurrence => {
  if (!r.ok) throw new Error(r.error);
  return r.occurrence;
};

/** An alarm that rang and was stopped with the phone's Stop control, mission not done. */
function unfinished(mode: CompletionMode): AlarmOccurrence {
  const alarm: Alarm = { ...createAlarmDraft({ completionMode: mode, gentleReminderMinutes: 10 }), id: `a-${mode}`, createdAt: 0, updatedAt: 0 };
  const fired = unwrap(markAlarmFired(createOccurrence({ alarm, scheduledAt: 1_000, source: 'native', now: 1_000, id: mode }), 1_000));
  return unwrap(recordSystemStop(fired, 2_000));
}

describe('Gentle follow-ups are part of Gentle mode', () => {
  it('an unfinished Gentle alarm always gets its follow-up at the alarm’s own delay', () => {
    expect(planGentleReminders([unfinished('gentle')], 3_000).schedule).toEqual([
      expect.objectContaining({ id: 'gentle-gentle', fireAt: 2_000 + 10 * 60_000 }),
    ]);
  });

  it('Reward and Challenge alarms never get a Gentle follow-up', () => {
    const plan = planGentleReminders([unfinished('reward'), unfinished('challenge')], 3_000);
    expect(plan.schedule).toEqual([]);
    expect(plan.cancel).toEqual(['gentle-reward', 'gentle-challenge']);
  });

  it('there is no setting to switch Gentle follow-ups off', () => {
    const screen = readFileSync(join(root, 'src', 'app', '(tabs)', 'settings', 'notifications.tsx'), 'utf8');
    expect(screen).not.toMatch(/SwitchRow|gentleFollowUps/);
    const handOff = readFileSync(join(root, 'src', 'features', 'alarms', 'alarm-handoff.ts'), 'utf8');
    expect(handOff).not.toMatch(/remindersEnabled/);
    expect(planGentleReminders.length).toBe(2); // (occurrences, now): no on/off argument
  });
});

describe('notification catalogue', () => {
  it('separates alarm-critical, mission reminders and optional engagement', () => {
    const by = (category: string) => NOTIFICATIONS.filter((n) => n.category === category).map((n) => n.id);
    expect(by('alarm_critical')).toEqual(['alarm']);
    expect(by('mission_reminder')).toEqual(['gentleFollowUp']);
    expect(by('engagement')).toEqual(['morningReminders', 'accountabilityNudges', 'faithReminders', 'circlesActivity']);
  });

  it('alarms and Gentle follow-ups are automatic; everything optional is only planned (nothing pretends to work)', () => {
    expect(NOTIFICATIONS.filter((n) => n.status === 'automatic').map((n) => n.id)).toEqual(['alarm', 'gentleFollowUp']);
    expect(NOTIFICATIONS.filter((n) => n.category === 'engagement').every((n) => n.status === 'planned')).toBe(true);
  });
});
