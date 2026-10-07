import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { toHistoryEntry } from './history';
import { createOccurrence, type AlarmOccurrence } from './occurrence';

const alarm: Alarm = { ...createAlarmDraft({ label: '' }), id: 'a', createdAt: 0, updatedAt: 0 };
const at = (h: number, m: number) => new Date(2026, 9, 6, h, m).getTime();
const base = createOccurrence({ alarm, scheduledAt: at(6, 30), source: 'simulated', now: at(6, 30), id: 'o' });
const native = { ...base, source: 'native' as const, fireEvidence: 'system' as const, startedAt: at(6, 30) };

describe('toHistoryEntry', () => {
  it('shows a completed mission with time, mistakes, mode and source', () => {
    const o: AlarmOccurrence = {
      ...base,
      status: 'completed',
      startedAt: at(6, 30),
      missionStartedAt: at(6, 31),
      endedAt: at(6, 32),
      result: {
        kind: 'mission_completed',
        mission: { difficulty: 'easy', questionCount: 3, attempts: 4, wrongAttempts: 1, accuracy: 0.75, durationMs: 1 },
      },
    };
    expect(toHistoryEntry(o)).toMatchObject({
      title: 'Alarm',
      mission: 'Maths · Easy · 3 questions · Reward mode',
      status: 'Mission completed',
      successful: true,
      completion: 'Done at 06:32 · 1 wrong answer',
      source: 'Simulated in Terbit MY',
    });
    expect(toHistoryEntry(o).scheduled).toMatch(/· 06:30$/);
  });

  it('shows a phone Stop without the mission as not successful', () => {
    const o: AlarmOccurrence = {
      ...native,
      status: 'dismissed',
      alarmStoppedAt: at(6, 31),
      alarmStopReason: 'system',
      endedAt: at(7, 30),
      result: { kind: 'system_dismiss' },
    };
    expect(toHistoryEntry(o)).toMatchObject({
      status: 'Stopped with phone controls · Mission not done',
      successful: false,
      completion: 'Alarm stopped with phone controls at 06:31',
      source: 'Real alarm (reported by Android)',
    });
  });

  it('shows abandoned, challenge-incomplete and missed mornings distinctly', () => {
    expect(
      toHistoryEntry({ ...native, status: 'missed', missionStartedAt: at(6, 33), endedAt: at(7, 30) }),
    ).toMatchObject({ status: 'Mission abandoned', completion: 'mission started 06:33', successful: false });

    expect(
      toHistoryEntry({
        ...native,
        completionMode: 'challenge',
        status: 'dismissed',
        alarmStoppedAt: at(6, 31),
        alarmStopReason: 'dismiss',
        endedAt: at(6, 31),
        result: { kind: 'emergency_dismiss' },
      }),
    ).toMatchObject({ status: 'Dismissed in Terbit MY · Challenge incomplete', mission: expect.stringMatching(/Challenge mode$/) });

    expect(
      toHistoryEntry({ ...native, fireEvidence: 'schedule', status: 'missed', endedAt: at(7, 31) }),
    ).toMatchObject({ status: 'Missed (no response recorded)', source: 'Real alarm (AlarmKit schedule)' });
  });
});
