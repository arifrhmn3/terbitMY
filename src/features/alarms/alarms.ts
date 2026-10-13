import { createAlarmHandOff } from './alarm-handoff';
import { withEffectiveSettings } from './alarm-features';
import { createSqliteAlarmRepository } from './alarm-repository';
import { createAlarmStore, useAlarmStore } from './alarm-store';
import { createOccurrenceManager } from './occurrence-manager';
import { createSqliteOccurrenceRepository } from './occurrence-repository';
import { entitlements } from '@/features/entitlements/entitlements';
import { getAlarmService } from '@/services/alarm-scheduler';
import { getReminderService } from '@/services/notifications';
import { getDatabase } from '@/services/storage/database';

/** Each time an alarm rings (or is simulated), saved in SQLite on the device. */
export const occurrences = createOccurrenceManager(async () => createSqliteOccurrenceRepository(await getDatabase()));

/** The app's alarm store on iOS and Android, saved in SQLite on the device. */
export const alarmStore = createAlarmStore(
  async () => createSqliteAlarmRepository(await getDatabase()),
  getAlarmService(),
  {
    // Deleting closes the alarm's open morning (history stays) and its Gentle reminder.
    onRemove: async (id) => {
      await occurrences.cancelForAlarm(id);
      await handOff.syncReminders().catch(() => {});
    },
    // Behaviour follows the user's entitlements (e.g. Challenge → Reward when unavailable).
    effective: (alarm) => withEffectiveSettings(alarm, entitlements.check()),
  },
);

/** Connects genuine native alarms to mornings and missions. */
export const handOff = createAlarmHandOff({
  alarmStore,
  occurrences,
  service: getAlarmService(),
  reminders: getReminderService().available ? getReminderService() : undefined,
  beforeSync: entitlements.ensureLoaded,
});

export function useAlarms() {
  return useAlarmStore(alarmStore);
}

/** Every saved alarm, read straight from SQLite (for cloud backup; doesn't touch the screens' state). */
export async function listSavedAlarms() {
  return createSqliteAlarmRepository(await getDatabase()).list();
}
