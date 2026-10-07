import type { AlarmService, NativeAlarmStatus } from './types';

const DEFAULT_SUMMARY = 'Alarms are saved on this phone, but they can’t ring here. Use the Terbit MY development build.';

const UNAVAILABLE: NativeAlarmStatus = {
  available: false,
  backend: 'none',
  permission: 'unavailable',
  fullScreenAllowed: null,
  detail: 'Native alarms need the Terbit MY development build (not Expo Go or the web preview).',
};

/**
 * Used where no native alarm code is available (Expo Go, web, tests). It
 * never pretends to schedule anything: every call reports `not-implemented`,
 * and it never reports that an alarm fired.
 */
export function createNotImplementedAlarmService(summary = DEFAULT_SUMMARY): AlarmService {
  return {
    async getCapabilities() {
      return {
        status: 'not-implemented',
        backend: 'none',
        ringsInSilentMode: false,
        summary,
      };
    },
    async requestPermission() {
      return 'not-implemented';
    },
    async schedule() {
      return { status: 'not-implemented' };
    },
    async cancel() {
      // Nothing was scheduled, so there is nothing to cancel.
    },
    async syncAll() {
      // Nothing to sync.
    },
    async getFireEvents() {
      return [];
    },
    async getNativeAlarmStatus() {
      return UNAVAILABLE;
    },
    async requestNativeAlarmPermission() {
      return UNAVAILABLE;
    },
    async scheduleOneTime() {
      return { status: 'not-implemented' };
    },
    async listNativeAlarms() {
      return [];
    },
    async openNativeAlarmSettings() {
      // No native settings to open.
    },
  };
}
