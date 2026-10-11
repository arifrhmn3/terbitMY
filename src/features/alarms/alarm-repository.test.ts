import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { alarmToRow, createMemoryAlarmRepository, rowToAlarm } from './alarm-repository';

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return { ...createAlarmDraft(), id: 'a', createdAt: 1, updatedAt: 2, ...overrides };
}

describe('row mapping', () => {
  it('round-trips every field', () => {
    const original = alarm({
      weekdays: [0, 6],
      enabled: false,
      label: 'Subuh',
      mission: { type: 'math', difficulty: 'hard', questionCount: 10 },
      snooze: { enabled: false, minutes: 15 },
      isPrimary: true,
    });
    expect(rowToAlarm(alarmToRow(original))).toEqual(original);
  });

  it('round-trips a one-off alarm with no mission', () => {
    const original = alarm({ weekdays: [], mission: { type: 'none' } });
    expect(rowToAlarm(alarmToRow(original))).toEqual(original);
  });

  it('falls back safely when stored data is damaged', () => {
    const row = { ...alarmToRow(alarm()), mission: '{not json', weekdays: '1,9,x,3', snooze_minutes: 7 };
    const restored = rowToAlarm(row);
    expect(restored.mission).toEqual(createAlarmDraft().mission);
    expect(restored.weekdays).toEqual([1, 3]);
    expect(restored.snooze.minutes).toBe(5);
  });
});

describe('memory repository', () => {
  it('saves, updates, lists in time order and removes', async () => {
    const repo = createMemoryAlarmRepository();
    await repo.save(alarm({ id: 'late', hour: 9 }));
    await repo.save(alarm({ id: 'early', hour: 5 }));
    await repo.save(alarm({ id: 'late', hour: 9, label: 'Updated' }));

    const list = await repo.list();
    expect(list.map((a) => a.id)).toEqual(['early', 'late']);
    expect(list[1].label).toBe('Updated');

    await repo.remove('early');
    expect((await repo.list()).map((a) => a.id)).toEqual(['late']);
  });

  it('keeps only one primary alarm', async () => {
    const repo = createMemoryAlarmRepository([alarm({ id: 'a', isPrimary: true })]);
    await repo.save(alarm({ id: 'b', isPrimary: true }));
    const primaries = (await repo.list()).filter((a) => a.isPrimary).map((a) => a.id);
    expect(primaries).toEqual(['b']);
  });
});
