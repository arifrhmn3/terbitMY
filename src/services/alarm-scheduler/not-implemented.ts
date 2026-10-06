import type { AlarmService } from './types';

/**
 * Used on every platform until the native alarm module is built. It never
 * pretends to schedule anything: every call reports `not-implemented`.
 */
export function createNotImplementedAlarmService(): AlarmService {
  return {
    async getCapabilities() {
      return {
        status: 'not-implemented',
        backend: 'none',
        ringsInSilentMode: false,
        summary: 'Alarms are saved on this phone, but they can’t ring yet. Ringing is still being built.',
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
  };
}
