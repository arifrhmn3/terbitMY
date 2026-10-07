import { describe, expect, it, jest } from '@jest/globals';

import type {
  NativeRecordPayload,
  NativeScheduleResult,
  NativeStatusPayload,
  TerbitAlarmsNativeModule,
} from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmSpec } from './types';

const granted: NativeStatusPayload = { available: true, backend: 'alarmkit', permission: 'granted', osVersion: '26.0' };

function fakeModule(overrides: Partial<TerbitAlarmsNativeModule> = {}, records: NativeRecordPayload[] = []) {
  const native: TerbitAlarmsNativeModule = {
    getStatusAsync: jest.fn(async () => granted),
    requestPermissionAsync: jest.fn(async () => granted),
    scheduleOneTimeAsync: jest.fn(async (): Promise<NativeScheduleResult> => ({ ok: true, nativeId: 'test-1' })),
    scheduleAlarmAsync: jest.fn(async (): Promise<NativeScheduleResult> => ({ ok: true, nativeId: 'saved-1' })),
    cancelAsync: jest.fn(async () => 1),
    listAsync: jest.fn(async () => records),
    openSettingsAsync: jest.fn(async () => {}),
    ...overrides,
  };
  return native;
}

const spec: AlarmSpec = {
  id: 'alarm-1',
  hour: 6,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
  label: 'Subuh',
  snoozeMinutes: null,
  missionRequired: true,
  title: 'Subuh',
  nextFireAt: 1_000_000,
  completionMode: 'challenge',
  actionLabel: 'Stop & Start Mission',
  soundId: 'system-default',
};

const request = { alarmId: 'native-test', occurrenceId: 'test-1', fireAt: 1_000_000, title: 'Test' };

describe('native alarm service: saved alarms', () => {
  it('schedules a saved alarm with its repeat days, next time and mode', async () => {
    const native = fakeModule();
    const result = await createNativeAlarmService(native, 'alarmkit').schedule(spec);
    expect(result).toEqual({ status: 'scheduled', nativeId: 'saved-1' });
    expect(native.scheduleAlarmAsync).toHaveBeenCalledWith({
      alarmId: 'alarm-1',
      hour: 6,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5],
      fireAt: 1_000_000,
      title: 'Subuh',
      missionRequired: true,
      completionMode: 'challenge',
      actionLabel: 'Stop & Start Mission',
    });
  });

  it('iOS: reads AlarmKit button taps to confirm fires', async () => {
    const record: NativeRecordPayload = {
      kind: 'saved',
      alarmId: 'alarm-1',
      occurrenceId: null,
      nativeId: 'uuid-1',
      fireAt: 0,
      createdAt: 0,
      state: 'scheduled',
      firedAt: null,
      stoppedAt: null,
      cancelledAt: null,
      hour: 0,
      minute: 0,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    const dueToday = new Date(2026, 9, 7, 0, 0).getTime();
    const native = fakeModule(
      { listActionsAsync: async () => [{ alarmId: 'alarm-1', nativeId: 'uuid-1', action: 'mission', at: dueToday + 60_000 }] },
      [record],
    );
    const events = await createNativeAlarmService(native, 'alarmkit').getFireEvents(dueToday - 1, dueToday + 120_000);
    expect(events).toEqual([expect.objectContaining({ scheduledAt: dueToday, evidence: 'system', stopAction: 'mission' })]);
  });

  it('maps permission errors to permission-denied and other errors to failed', async () => {
    for (const code of ['not_authorized', 'exact_alarm_not_allowed'] as const) {
      const native = fakeModule({ scheduleAlarmAsync: async () => ({ ok: false, code, message: 'Turn it on' }) });
      expect(await createNativeAlarmService(native, 'alarm-manager').schedule(spec)).toEqual({
        status: 'permission-denied',
        message: 'Turn it on',
      });
    }
    const failing = fakeModule({
      scheduleAlarmAsync: async () => {
        throw new Error('boom');
      },
    });
    expect(await createNativeAlarmService(failing, 'alarmkit').schedule(spec)).toEqual({
      status: 'failed',
      code: 'native_error',
      message: 'boom',
    });
  });

  it('cancels through the native module', async () => {
    const native = fakeModule();
    await createNativeAlarmService(native, 'alarm-manager').cancel('alarm-1');
    expect(native.cancelAsync).toHaveBeenCalledWith('alarm-1');
  });

  it('syncAll schedules changed alarms, skips up-to-date ones and cancels stale ones', async () => {
    const live = (alarmId: string, extra: Partial<NativeRecordPayload> = {}): NativeRecordPayload => ({
      kind: 'saved',
      alarmId,
      occurrenceId: null,
      nativeId: alarmId,
      fireAt: 1_000_000,
      createdAt: 0,
      state: 'scheduled',
      firedAt: null,
      stoppedAt: null,
      cancelledAt: null,
      hour: 6,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5],
      ...extra,
    });
    const native = fakeModule({}, [live('alarm-1'), live('deleted-alarm'), live('alarm-2', { minute: 0 })]);
    const service = createNativeAlarmService(native, 'alarmkit');
    await service.syncAll([spec, { ...spec, id: 'alarm-2', minute: 15 }]);

    expect(native.cancelAsync).toHaveBeenCalledTimes(1);
    expect(native.cancelAsync).toHaveBeenCalledWith('deleted-alarm');
    expect(native.scheduleAlarmAsync).toHaveBeenCalledTimes(1);
    expect(native.scheduleAlarmAsync).toHaveBeenCalledWith(expect.objectContaining({ alarmId: 'alarm-2', minute: 15 }));
  });

  it('reports ready only when the alarm permission is granted', async () => {
    expect((await createNativeAlarmService(fakeModule(), 'alarmkit').getCapabilities()).status).toBe('ready');
    const denied = fakeModule({ getStatusAsync: async () => ({ ...granted, permission: 'denied' }) });
    expect((await createNativeAlarmService(denied, 'alarmkit').getCapabilities()).status).toBe('needs-permission');
    const oldIos = fakeModule({
      getStatusAsync: async () => ({ ...granted, available: false, reason: 'AlarmKit needs iOS 26 or later.' }),
    });
    expect(await createNativeAlarmService(oldIos, 'alarmkit').getCapabilities()).toMatchObject({
      status: 'not-implemented',
      summary: 'AlarmKit needs iOS 26 or later.',
    });
  });
});

describe('native alarm service: developer test alarm', () => {
  it('passes Terbit MY IDs and time to the native module', async () => {
    const native = fakeModule();
    expect(await createNativeAlarmService(native, 'alarmkit').scheduleOneTime(request)).toEqual({
      status: 'scheduled',
      nativeId: 'test-1',
    });
    expect(native.scheduleOneTimeAsync).toHaveBeenCalledWith(request);
  });

  it('maps native status, marking unsupported OS as unavailable', async () => {
    const native = fakeModule({
      getStatusAsync: async () => ({ ...granted, available: false, permission: 'denied', reason: 'Needs iOS 26' }),
    });
    expect(await createNativeAlarmService(native, 'alarmkit').getNativeAlarmStatus()).toEqual({
      available: false,
      backend: 'alarmkit',
      permission: 'unavailable',
      fullScreenAllowed: null,
      detail: 'Needs iOS 26',
    });
  });
});

describe('not-implemented service', () => {
  it('reports native alarms as unavailable and never schedules or reports fires', async () => {
    const service = createNotImplementedAlarmService();
    expect((await service.getNativeAlarmStatus()).available).toBe(false);
    expect(await service.scheduleOneTime(request)).toEqual({ status: 'not-implemented' });
    expect(await service.schedule(spec)).toEqual({ status: 'not-implemented' });
    expect(await service.getFireEvents(0, 1)).toEqual([]);
  });
});
