import { describe, expect, it, jest } from '@jest/globals';

import { createAlarmDraft } from './alarm';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore, toAlarmSpec } from './alarm-store';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmService } from '@/services/alarm-scheduler';

function setup() {
  const repository = createMemoryAlarmRepository();
  const base = createNotImplementedAlarmService();
  const service: AlarmService = {
    ...base,
    schedule: jest.fn(base.schedule),
    cancel: jest.fn(base.cancel),
  };
  let time = 1000;
  const store = createAlarmStore(async () => repository, service, () => time++);
  return { store, repository, service };
}

describe('alarm store', () => {
  it('loads saved alarms', async () => {
    const { store } = setup();
    expect(store.getState().status).toBe('idle');
    await store.load();
    expect(store.getState()).toEqual({ status: 'ready', alarms: [], error: null });
  });

  it('saves to the repository and reports that ringing is not implemented', async () => {
    const { store, repository, service } = setup();
    await store.load();

    const { alarm, result } = await store.save(createAlarmDraft({ label: '  Subuh  ' }));

    expect(result).toEqual({ status: 'not-implemented' });
    expect(service.schedule).toHaveBeenCalledWith(toAlarmSpec(alarm));
    expect(alarm.label).toBe('Subuh');
    expect(await repository.list()).toEqual([alarm]);
    expect(store.getState().alarms).toEqual([alarm]);
  });

  it('updates an existing alarm and keeps its id and creation time', async () => {
    const { store } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());
    const { alarm: updated } = await store.save(createAlarmDraft({ hour: 5 }), alarm.id);

    expect(updated.id).toBe(alarm.id);
    expect(updated.createdAt).toBe(alarm.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(alarm.updatedAt);
    expect(store.getState().alarms).toHaveLength(1);
  });

  it('rejects invalid alarms without saving', async () => {
    const { store, repository } = setup();
    await store.load();
    await expect(store.save(createAlarmDraft({ hour: 25 }))).rejects.toThrow('invalid-hour');
    expect(await repository.list()).toEqual([]);
  });

  it('cancels instead of scheduling when an alarm is turned off', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());

    await store.setEnabled(alarm.id, false);
    expect(service.cancel).toHaveBeenCalledWith(alarm.id);
    expect(store.getState().alarms[0].enabled).toBe(false);
  });

  it('moves the primary flag when another alarm becomes primary', async () => {
    const { store, repository } = setup();
    await store.load();
    const { alarm: first } = await store.save(createAlarmDraft({ isPrimary: true }));
    const { alarm: second } = await store.save(createAlarmDraft({ hour: 7, isPrimary: true }));

    const primaryIds = (alarms: { id: string; isPrimary: boolean }[]) =>
      alarms.filter((a) => a.isPrimary).map((a) => a.id);
    expect(primaryIds(store.getState().alarms)).toEqual([second.id]);
    expect(primaryIds(await repository.list())).toEqual([second.id]);
    expect(first.id).not.toBe(second.id);
  });

  it('removes from the repository and cancels', async () => {
    const { store, repository, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());
    await store.remove(alarm.id);
    expect(await repository.list()).toEqual([]);
    expect(store.getState().alarms).toEqual([]);
    expect(service.cancel).toHaveBeenCalledWith(alarm.id);
  });

  it('reports a storage error', async () => {
    const store = createAlarmStore(
      async () => {
        throw new Error('disk full');
      },
      createNotImplementedAlarmService(),
    );
    await store.load();
    expect(store.getState()).toMatchObject({ status: 'error', error: 'disk full' });
  });
});

describe('not-implemented alarm service', () => {
  it('never claims to schedule or ring', async () => {
    const service = createNotImplementedAlarmService();
    expect((await service.getCapabilities()).status).toBe('not-implemented');
    expect(await service.requestPermission()).toBe('not-implemented');
    expect(await service.schedule(toAlarmSpec({ ...createAlarmDraft(), id: 'x', createdAt: 0, updatedAt: 0 }))).toEqual({
      status: 'not-implemented',
    });
  });
});
