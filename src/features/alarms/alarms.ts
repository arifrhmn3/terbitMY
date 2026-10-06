import { createSqliteAlarmRepository } from './alarm-repository';
import { createAlarmStore, useAlarmStore } from './alarm-store';
import { createOccurrenceManager } from './occurrence-manager';
import { createSqliteOccurrenceRepository } from './occurrence-repository';
import { getAlarmService } from '@/services/alarm-scheduler';
import { getDatabase } from '@/services/storage/database';

/** Each time an alarm rings (or is simulated), saved in SQLite on the device. */
export const occurrences = createOccurrenceManager(async () => createSqliteOccurrenceRepository(await getDatabase()));

/** The app's alarm store on iOS and Android, saved in SQLite on the device. */
export const alarmStore = createAlarmStore(
  async () => createSqliteAlarmRepository(await getDatabase()),
  getAlarmService(),
  { onRemove: occurrences.cancelForAlarm },
);

export function useAlarms() {
  return useAlarmStore(alarmStore);
}
