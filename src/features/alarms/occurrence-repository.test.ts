import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { createOccurrence, dismissOccurrence, startOccurrence, type AlarmOccurrence } from './occurrence';
import {
  createMemoryOccurrenceRepository,
  DuplicateOccurrenceError,
  occurrenceToRow,
  rowToOccurrence,
} from './occurrence-repository';

const alarm: Alarm = { ...createAlarmDraft(), id: 'alarm-1', createdAt: 0, updatedAt: 0 };

function occurrence(id: string, scheduledAt: number, alarmId = 'alarm-1'): AlarmOccurrence {
  return createOccurrence({ alarm: { ...alarm, id: alarmId }, scheduledAt, source: 'simulated', now: scheduledAt, id });
}

function dismissed(o: AlarmOccurrence) {
  const result = dismissOccurrence(o, o.scheduledAt + 1);
  if (!result.ok) throw new Error(result.error);
  return result.occurrence;
}

describe('row mapping', () => {
  it('round-trips a finished occurrence with a result', () => {
    const o: AlarmOccurrence = {
      ...occurrence('o1', 100),
      status: 'completed',
      startedAt: 101,
      missionStartedAt: 102,
      missionCompletedAt: 150,
      endedAt: 150,
      result: {
        kind: 'mission_completed',
        mission: { difficulty: 'hard', questionCount: 10, attempts: 12, wrongAttempts: 2, accuracy: 10 / 12, durationMs: 48 },
      },
    };
    expect(rowToOccurrence(occurrenceToRow(o))).toEqual(o);
  });

  it('treats an unknown stored status as cancelled, never active', () => {
    const row = { ...occurrenceToRow(occurrence('o1', 100)), status: 'exploded', result: '{bad' };
    expect(rowToOccurrence(row)).toMatchObject({ status: 'cancelled', result: null });
  });
});

describe('memory occurrence repository', () => {
  it('rejects a second occurrence for the same alarm event', async () => {
    const repo = createMemoryOccurrenceRepository();
    await repo.insert(dismissed(occurrence('o1', 100)));
    await expect(repo.insert(occurrence('o2', 100))).rejects.toBeInstanceOf(DuplicateOccurrenceError);
  });

  it('rejects a second active occurrence for the same alarm', async () => {
    const repo = createMemoryOccurrenceRepository();
    await repo.insert(occurrence('o1', 100));
    await expect(repo.insert(occurrence('o2', 200))).rejects.toBeInstanceOf(DuplicateOccurrenceError);
    // Another alarm is fine.
    await expect(repo.insert(occurrence('o3', 200, 'alarm-2'))).resolves.toBeUndefined();
  });

  it('allows a new active occurrence once the previous one finished', async () => {
    const repo = createMemoryOccurrenceRepository();
    const first = occurrence('o1', 100);
    await repo.insert(first);
    await repo.update(dismissed(first), 'scheduled');
    await expect(repo.insert(occurrence('o2', 200))).resolves.toBeUndefined();
  });

  it('only updates when the stored status matches (compare-and-set)', async () => {
    const repo = createMemoryOccurrenceRepository();
    const o = occurrence('o1', 100);
    await repo.insert(o);
    const started = startOccurrence(o, 101);
    if (!started.ok) throw new Error();

    expect(await repo.update(started.occurrence, 'scheduled')).toBe(true);
    // A second writer still thinks it is 'scheduled': rejected.
    expect(await repo.update(dismissed(o), 'scheduled')).toBe(false);
    expect((await repo.get('o1'))?.status).toBe('started');
  });

  it('lists recent newest first and active oldest first', async () => {
    const repo = createMemoryOccurrenceRepository();
    await repo.insert(dismissed(occurrence('old', 100)));
    await repo.insert(occurrence('a2', 300, 'alarm-2'));
    await repo.insert(occurrence('a1', 200));
    expect((await repo.listRecent(10)).map((o) => o.id)).toEqual(['a2', 'a1', 'old']);
    expect((await repo.listRecent(1)).map((o) => o.id)).toEqual(['a2']);
    expect((await repo.listActive()).map((o) => o.id)).toEqual(['a1', 'a2']);
  });
});
