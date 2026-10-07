import type {
  NativeScheduleResult,
  NativeStatusPayload,
  TerbitAlarmsNativeModule,
} from '../../../modules/terbit-alarms';

import { alarmKitFireEvents, androidFireEvents, isNativeUpToDate, staleSavedAlarmIds } from './native-records';
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

function toScheduleResult(result: NativeScheduleResult): ScheduleResult {
  if (result.ok) return { status: 'scheduled', nativeId: result.nativeId };
  if (result.code === 'not_authorized' || result.code === 'exact_alarm_not_allowed') {
    return { status: 'permission-denied', message: result.message };
  }
  return { status: 'failed', code: result.code, message: result.message };
}

/**
 * Connects the shared `AlarmService` to the TerbitAlarms native module. Same
 * TypeScript for both platforms; the module is Swift (AlarmKit) on iOS and
 * Kotlin (AlarmManager) on Android. The phone's own Stop controls are never
 * blocked.
 */
export function createNativeAlarmService(native: TerbitAlarmsNativeModule, backend: AlarmBackend): AlarmService {
  async function status(): Promise<NativeAlarmStatus> {
    try {
      return toNativeAlarmStatus(await native.getStatusAsync());
    } catch (error) {
      return { available: false, backend, permission: 'unavailable', fullScreenAllowed: null, detail: errorMessage(error) };
    }
  }

  async function guarded(action: () => Promise<NativeScheduleResult>): Promise<ScheduleResult> {
    try {
      return toScheduleResult(await action());
    } catch (error) {
      return { status: 'failed', code: 'native_error', message: errorMessage(error) };
    }
  }

  const service: AlarmService = {
    async getCapabilities() {
      const s = await status();
      if (!s.available) {
        return { status: 'not-implemented', backend, ringsInSilentMode: false, summary: s.detail ?? 'Native alarms aren’t available on this phone.' };
      }
      if (s.permission !== 'granted') {
        return {
          status: 'needs-permission',
          backend,
          ringsInSilentMode: backend === 'alarmkit',
          summary: s.detail ?? 'Allow alarms for Terbit MY so your saved alarms can ring.',
        };
      }
      return { status: 'ready', backend, ringsInSilentMode: backend === 'alarmkit', summary: 'Your saved alarms ring on this phone.' };
    },

    async requestPermission() {
      const s = toNativeAlarmStatus(await native.requestPermissionAsync());
      return s.permission === 'granted' ? 'granted' : 'denied';
    },

    schedule(spec) {
      return guarded(() =>
        native.scheduleAlarmAsync({
          alarmId: spec.id,
          hour: spec.hour,
          minute: spec.minute,
          weekdays: [...spec.weekdays],
          fireAt: spec.nextFireAt,
          title: spec.title,
          missionRequired: spec.missionRequired,
          completionMode: spec.completionMode,
          actionLabel: spec.actionLabel,
        }),
      );
    },

    async cancel(alarmId) {
      await native.cancelAsync(alarmId);
    },

    async syncAll(specs) {
      const records = await native.listAsync();
      for (const id of staleSavedAlarmIds(records, new Set(specs.map((s) => s.id)))) {
        await native.cancelAsync(id);
      }
      for (const spec of specs) {
        if (!isNativeUpToDate(records, spec, backend)) await service.schedule(spec);
      }
    },

    async getFireEvents(since, now) {
      const records = await native.listAsync();
      if (backend !== 'alarmkit') return androidFireEvents(records, since);
      const actions = native.listActionsAsync ? await native.listActionsAsync() : [];
      return alarmKitFireEvents(records, since, now, actions);
    },

    getNativeAlarmStatus: status,

    async requestNativeAlarmPermission() {
      return toNativeAlarmStatus(await native.requestPermissionAsync());
    },

    scheduleOneTime(request) {
      return guarded(() =>
        native.scheduleOneTimeAsync({
          alarmId: request.alarmId,
          occurrenceId: request.occurrenceId,
          fireAt: request.fireAt,
          title: request.title,
        }),
      );
    },

    async listNativeAlarms() {
      return native.listAsync();
    },

    async openNativeAlarmSettings() {
      await native.openSettingsAsync();
    },
  };
  return service;
}
