import { describe, expect, it, jest } from '@jest/globals';

import type { NativeScheduleResult, NativeStatusPayload, TerbitAlarmsNativeModule } from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmSpec } from './types';

const grantedIos: NativeStatusPayload = { available: true, backend: 'alarmkit', permission: 'granted', osVersion: '26.0' };

function fakeModule(overrides: Partial<TerbitAlarmsNativeModule> = {}) {
  const native: TerbitAlarmsNativeModule = {
    getStatusAsync: jest.fn(async () => grantedIos),
    requestPermissionAsync: jest.fn(async () => grantedIos),
    scheduleOneTimeAsync: jest.fn(async (): Promise<NativeScheduleResult> => ({ ok: true, nativeId: 'uuid-1' })),
    cancelAsync: jest.fn(async () => 1),
    listAsync: jest.fn(async () => []),
    openSettingsAsync: jest.fn(async () => {}),
    ...overrides,
  };
  return native;
}

const request = { alarmId: 'native-test', occurrenceId: 'test-1', fireAt: 1_000_000, title: 'Test' };

describe('native alarm service', () => {
  it('passes Terbit MY IDs and time to the native module', async () => {
    const native = fakeModule();
    const service = createNativeAlarmService(native, 'alarmkit', 'summary');
    expect(await service.scheduleOneTime(request)).toEqual({ status: 'scheduled', nativeId: 'uuid-1' });
    expect(native.scheduleOneTimeAsync).toHaveBeenCalledWith(request);
  });

  it('maps permission errors to permission-denied', async () => {
    for (const code of ['not_authorized', 'exact_alarm_not_allowed'] as const) {
      const native = fakeModule({ scheduleOneTimeAsync: async () => ({ ok: false, code, message: 'Turn it on' }) });
      const result = await createNativeAlarmService(native, 'alarm-manager', 's').scheduleOneTime(request);
      expect(result).toEqual({ status: 'permission-denied', message: 'Turn it on' });
    }
  });

  it('returns other native errors with their code', async () => {
    const native = fakeModule({
      scheduleOneTimeAsync: async () => ({ ok: false, code: 'unsupported_os', message: 'Needs iOS 26' }),
    });
    const result = await createNativeAlarmService(native, 'alarmkit', 's').scheduleOneTime(request);
    expect(result).toEqual({ status: 'failed', code: 'unsupported_os', message: 'Needs iOS 26' });
  });

  it('turns a thrown native exception into a failed result', async () => {
    const native = fakeModule({
      scheduleOneTimeAsync: async () => {
        throw new Error('boom');
      },
    });
    const result = await createNativeAlarmService(native, 'alarmkit', 's').scheduleOneTime(request);
    expect(result).toEqual({ status: 'failed', code: 'native_error', message: 'boom' });
  });

  it('maps native status, marking unsupported OS as unavailable', async () => {
    const native = fakeModule({
      getStatusAsync: async () => ({
        available: false,
        backend: 'alarmkit',
        permission: 'denied',
        osVersion: '18.5',
        reason: 'AlarmKit needs iOS 26 or later.',
      }),
    });
    expect(await createNativeAlarmService(native, 'alarmkit', 's').getNativeAlarmStatus()).toEqual({
      available: false,
      backend: 'alarmkit',
      permission: 'unavailable',
      fullScreenAllowed: null,
      detail: 'AlarmKit needs iOS 26 or later.',
    });
  });

  it('cancels through the native module', async () => {
    const native = fakeModule();
    await createNativeAlarmService(native, 'alarm-manager', 's').cancel('native-test');
    expect(native.cancelAsync).toHaveBeenCalledWith('native-test');
  });

  it('still reports saved repeating alarms as not implemented', async () => {
    const service = createNativeAlarmService(fakeModule(), 'alarmkit', 'summary');
    const spec: AlarmSpec = {
      id: 'a',
      hour: 6,
      minute: 30,
      weekdays: [1],
      label: '',
      snoozeMinutes: null,
      missionRequired: true,
    };
    expect(await service.schedule(spec)).toEqual({ status: 'not-implemented' });
    expect((await service.getCapabilities()).status).toBe('not-implemented');
  });
});

describe('not-implemented service', () => {
  it('reports native alarms as unavailable and never schedules', async () => {
    const service = createNotImplementedAlarmService();
    expect((await service.getNativeAlarmStatus()).available).toBe(false);
    expect(await service.scheduleOneTime(request)).toEqual({ status: 'not-implemented' });
    expect(await service.listNativeAlarms()).toEqual([]);
  });
});
