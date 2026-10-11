import { TerbitAlarms } from '../../../modules/terbit-alarms';

/**
 * Local reminder notifications (Gentle mode follow-ups). Device-only, no
 * cloud or push. iOS: UNUserNotificationCenter via the TerbitAlarms module.
 * Android: not implemented yet (iOS-first prototype; added in the Android
 * parity phase behind this same interface).
 */
export interface ReminderService {
  available: boolean;
  requestPermission(): Promise<'granted' | 'denied' | 'unavailable'>;
  /** Schedules (or replaces) a reminder with this id. Returns false if it couldn't be scheduled. */
  schedule(reminder: { id: string; title: string; body: string; fireAt: number }): Promise<boolean>;
  cancel(id: string): Promise<void>;
}

const unavailable: ReminderService = {
  available: false,
  async requestPermission() {
    return 'unavailable';
  },
  async schedule() {
    return false;
  },
  async cancel() {},
};

function createForPlatform(): ReminderService {
  const native = TerbitAlarms;
  if (process.env.EXPO_OS !== 'ios' || !native?.scheduleReminderAsync || !native.cancelReminderAsync) return unavailable;
  const { scheduleReminderAsync, cancelReminderAsync, requestReminderPermissionAsync } = native;
  return {
    available: true,
    async requestPermission() {
      return requestReminderPermissionAsync ? requestReminderPermissionAsync() : 'unavailable';
    },
    async schedule(reminder) {
      try {
        return await scheduleReminderAsync(reminder);
      } catch {
        return false;
      }
    },
    async cancel(id) {
      await cancelReminderAsync(id).catch(() => {});
    },
  };
}

let service: ReminderService | null = null;

export function getReminderService(): ReminderService {
  service ??= createForPlatform();
  return service;
}
