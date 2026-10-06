import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { toHistoryEntry } from './history';
import { createOccurrence, type AlarmOccurrence } from './occurrence';

const alarm: Alarm = { ...createAlarmDraft({ label: '' }), id: 'a', createdAt: 0, updatedAt: 0 };
const at = (h: number, m: number) => new Date(2026, 9, 6, h, m).getTime();
const base = createOccurrence({ alarm, scheduledAt: at(6, 30), source: 'simulated', now: at(6, 30), id: 'o' });

describe('toHistoryEntry', () => {
  it('shows a completed mission with time and mistakes', () => {
    const o: AlarmOccurrence = {
      ...base,
      status: 'completed',
      endedAt: at(6, 32),
      result: {
        kind: 'mission_completed',
        mission: { difficulty: 'easy', questionCount: 3, attempts: 4, wrongAttempts: 1, accuracy: 0.75, durationMs: 1 },
      },
    };
    expect(toHistoryEntry(o)).toMatchObject({
      title: 'Alarm',
      mission: 'Maths · Easy · 3 questions',
      status: 'Completed',
      completion: 'Done at 06:32 · 1 wrong answer',
      simulated: true,
    });
    expect(toHistoryEntry(o).scheduled).toMatch(/· 06:30$/);
  });

  it('shows dismissed and missed differently from completed', () => {
    expect(toHistoryEntry({ ...base, status: 'dismissed', endedAt: at(6, 31) })).toMatchObject({
      status: 'Dismissed',
      completion: 'Dismissed at 06:31',
    });
    expect(toHistoryEntry({ ...base, status: 'missed', endedAt: at(8, 0) })).toMatchObject({
      status: 'Missed',
      completion: null,
    });
  });
});
