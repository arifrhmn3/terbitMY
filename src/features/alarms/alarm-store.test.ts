import { describe, expect, it, jest } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { createMemoryAlarmRepository } from './alarm-repository';
import { alarmTitle, createAlarmStore, toAlarmSpec } from './alarm-store';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmService, AlarmSpec } from '@/services/alarm-scheduler';

// Tuesday 6 October 2026, 07:00 local time
const TUESDAY_7AM = new Date(2026, 9, 6, 7, 0).getTime();

function setup() {
  const repository = createMemoryAlarmRepository();
  const base = createNotImplementedAlarmService();
  const service: AlarmService = {
    ...base,
    schedule: jest.fn(async (_spec: AlarmSpec) => ({ status: 'scheduled' as const, nativeId: 'n1' })),
    cancel: jest.fn(base.cancel),
    syncAll: jest.fn(base.syncAll),
  };
  let time = TUESDAY_7AM;
  const store = createAlarmStore(async () => repository, service, { now: () => time++ });
  return { store, repository, service, setTime: (t: number) => (time = t) };
}

const scheduledSpecs = (service: AlarmService) =>
  (service.schedule as jest.Mock<AlarmService['schedule']>).mock.calls.map(([spec]) => spec);

describe('alarm store', () => {
  it('loads saved alarms', async () => {
    const { store } = setup();
    expect(store.getState().status).toBe('idle');
    await store.load();
    expect(store.getState()).toEqual({ status: 'ready', alarms: [], error: null });
  });

  it('saves to the repository and schedules a real native alarm', async () => {
    const { store, repository, service } = setup();
    await store.load();

    const { alarm, result } = await store.save(createAlarmDraft({ label: '  Subuh  ' }));

    expect(result).toEqual({ status: 'scheduled', nativeId: 'n1' });
    expect(alarm.label).toBe('Subuh');
    expect(await repository.list()).toEqual([alarm]);
    const [spec] = scheduledSpecs(service);
    // Weekdays 06:30, saved Tuesday 07:00 → next ring Wednesday 06:30.
    expect(spec).toMatchObject({
      id: alarm.id,
      hour: 6,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5],
      title: 'Subuh',
      missionRequired: true,
      completionMode: 'reward',
      nextFireAt: new Date(2026, 9, 7, 6, 30).getTime(),
    });
  });

  it('reschedules natively when an alarm is edited, keeping its id', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());
    const { alarm: updated } = await store.save(createAlarmDraft({ hour: 8, weekdays: [6], completionMode: 'challenge' }), alarm.id);

    expect(updated.id).toBe(alarm.id);
    expect(updated.createdAt).toBe(alarm.createdAt);
    const specs = scheduledSpecs(service);
    expect(specs).toHaveLength(2);
    expect(specs[1]).toMatchObject({
      id: alarm.id,
      hour: 8,
      weekdays: [6],
      completionMode: 'challenge',
      nextFireAt: new Date(2026, 9, 10, 8, 30).getTime(),
    });
  });

  it('rejects invalid alarms without saving or scheduling', async () => {
    const { store, repository, service } = setup();
    await store.load();
    await expect(store.save(createAlarmDraft({ hour: 25 }))).rejects.toThrow('invalid-hour');
    expect(await repository.list()).toEqual([]);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('cancels native scheduling when an alarm is turned off, and reschedules when turned on', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());

    await store.setEnabled(alarm.id, false);
    expect(service.cancel).toHaveBeenCalledWith(alarm.id);
    expect(store.getState().alarms[0].enabled).toBe(false);

    await store.setEnabled(alarm.id, true);
    expect(scheduledSpecs(service)).toHaveLength(2);
  });

  it('saving a disabled alarm cancels instead of scheduling', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm, result } = await store.save(createAlarmDraft({ enabled: false }));
    expect(result).toBeNull();
    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.cancel).toHaveBeenCalledWith(alarm.id);
  });

  it('cancels native scheduling when an alarm is deleted', async () => {
    const { store, repository, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft());
    await store.remove(alarm.id);
    expect(await repository.list()).toEqual([]);
    expect(store.getState().alarms).toEqual([]);
    expect(service.cancel).toHaveBeenCalledWith(alarm.id);
  });

  it('syncs only enabled alarms with the native schedule', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm: on } = await store.save(createAlarmDraft());
    await store.save(createAlarmDraft({ hour: 9, enabled: false }));
    await store.syncNative();
    const [specs] = (service.syncAll as jest.Mock<AlarmService['syncAll']>).mock.calls.at(-1)!;
    expect(specs.map((s) => s.id)).toEqual([on.id]);
  });

  it('turns off a one-off alarm after it rang, without cancelling the native alarm', async () => {
    const { store, service } = setup();
    await store.load();
    const { alarm } = await store.save(createAlarmDraft({ weekdays: [] }));
    (service.cancel as jest.Mock).mockClear();

    await store.disableAfterRinging(alarm.id, alarm.updatedAt + 60_000);
    expect(store.getState().alarms[0].enabled).toBe(false);
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('leaves repeating alarms, and one-offs edited after ringing, enabled', async () => {
    const { store } = setup();
    await store.load();
    const { alarm: weekly } = await store.save(createAlarmDraft());
    const { alarm: once } = await store.save(createAlarmDraft({ weekdays: [] }));
    await store.disableAfterRinging(weekly.id, weekly.updatedAt + 60_000);
    await store.disableAfterRinging(once.id, once.updatedAt - 60_000);
    expect(store.getState().alarms.every((a) => a.enabled)).toBe(true);
  });

  it('moves the primary flag when another alarm becomes primary', async () => {
    const { store, repository } = setup();
    await store.load();
    await store.save(createAlarmDraft({ isPrimary: true }));
    const { alarm: second } = await store.save(createAlarmDraft({ hour: 7, isPrimary: true }));
    const primaryIds = (alarms: { id: string; isPrimary: boolean }[]) => alarms.filter((a) => a.isPrimary).map((a) => a.id);
    expect(primaryIds(store.getState().alarms)).toEqual([second.id]);
    expect(primaryIds(await repository.list())).toEqual([second.id]);
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

describe('toAlarmSpec', () => {
  const alarm = (overrides: Partial<Alarm> = {}): Alarm => ({ ...createAlarmDraft(overrides), id: 'a', createdAt: 0, updatedAt: 0 });

  it('computes the next ring for one-off and weekly alarms', () => {
    // One-off 06:30 at Tuesday 07:00 → Wednesday 06:30; one-off 08:00 → today 08:00.
    expect(toAlarmSpec(alarm({ weekdays: [] }), TUESDAY_7AM).nextFireAt).toBe(new Date(2026, 9, 7, 6, 30).getTime());
    expect(toAlarmSpec(alarm({ weekdays: [], hour: 8, minute: 0 }), TUESDAY_7AM).nextFireAt).toBe(
      new Date(2026, 9, 6, 8, 0).getTime(),
    );
    // Sunday only → Sunday 11 October.
    expect(toAlarmSpec(alarm({ weekdays: [0] }), TUESDAY_7AM).nextFireAt).toBe(new Date(2026, 9, 11, 6, 30).getTime());
  });

  it('uses a challenge title that points to the mission', () => {
    expect(alarmTitle(alarm({ label: 'Subuh', completionMode: 'challenge' }))).toBe(
      'Subuh · Challenge: open Terbit MY for your mission',
    );
    expect(alarmTitle(alarm({ completionMode: 'reward' }))).toBe('Terbit MY alarm');
    expect(alarmTitle(alarm({ completionMode: 'challenge', mission: { type: 'none' } }))).toBe('Terbit MY alarm');
  });
});

describe('not-implemented alarm service', () => {
  it('never claims to schedule or ring', async () => {
    const service = createNotImplementedAlarmService();
    expect((await service.getCapabilities()).status).toBe('not-implemented');
    expect(await service.requestPermission()).toBe('not-implemented');
    const spec = toAlarmSpec({ ...createAlarmDraft(), id: 'x', createdAt: 0, updatedAt: 0 }, TUESDAY_7AM);
    expect(await service.schedule(spec)).toEqual({ status: 'not-implemented' });
    expect(await service.getFireEvents(0, TUESDAY_7AM)).toEqual([]);
  });
});
