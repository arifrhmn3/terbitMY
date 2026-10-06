import type { NativeStatusPayload, TerbitAlarmsNativeModule } from '../../../modules/terbit-alarms';

import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmBackend, AlarmService, NativeAlarmStatus, ScheduleResult } from './types';

export function toNativeAlarmStatus(payload: NativeStatusPayload): NativeAlarmStatus {
  return {
    available: payload.available,
    backend: payload.backend,
    permission: payload.available ? payload.permission : 'unavailable',
    fullScreenAllowed: payload.fullScreenAllowed ?? null,
    detail: payload.reason ?? null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects the shared `AlarmService` to the TerbitAlarms native module.
 * Same TypeScript for both platforms; the module is Swift on iOS and Kotlin
 * on Android.
 *
 * Milestone 1 only adds one-time native alarms. The user's saved (repeating)
 * alarms still go through `schedule()`, which stays `not-implemented`, so
 * nothing claims those ring yet.
 */
export function createNativeAlarmService(
  native: TerbitAlarmsNativeModule,
  backend: AlarmBackend,
  summary: string,
): AlarmService {
  const base = createNotImplementedAlarmService(summary);

  return {
    ...base,

    async cancel(alarmId) {
      await native.cancelAsync(alarmId);
    },

    async getNativeAlarmStatus() {
      try {
        return toNativeAlarmStatus(await native.getStatusAsync());
      } catch (error) {
        return { available: false, backend, permission: 'unavailable', fullScreenAllowed: null, detail: errorMessage(error) };
      }
    },

    async requestNativeAlarmPermission() {
      return toNativeAlarmStatus(await native.requestPermissionAsync());
    },

    async scheduleOneTime(request): Promise<ScheduleResult> {
      try {
        const result = await native.scheduleOneTimeAsync({
          alarmId: request.alarmId,
          occurrenceId: request.occurrenceId,
          fireAt: request.fireAt,
          title: request.title,
        });
        if (result.ok) return { status: 'scheduled', nativeId: result.nativeId };
        if (result.code === 'not_authorized' || result.code === 'exact_alarm_not_allowed') {
          return { status: 'permission-denied', message: result.message };
        }
        return { status: 'failed', code: result.code, message: result.message };
      } catch (error) {
        return { status: 'failed', code: 'native_error', message: errorMessage(error) };
      }
    },

    async listNativeAlarms() {
      return native.listAsync();
    },

    async openNativeAlarmSettings() {
      await native.openSettingsAsync();
    },
  };
}
