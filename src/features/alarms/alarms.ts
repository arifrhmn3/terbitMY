import { createSqliteAlarmRepository } from './alarm-repository';
import { createAlarmStore, useAlarmStore } from './alarm-store';
import { getAlarmService } from '@/services/alarm-scheduler';
import { getDatabase } from '@/services/storage/database';

/** The app's alarm store on iOS and Android, saved in SQLite on the device. */
export const alarmStore = createAlarmStore(
  async () => createSqliteAlarmRepository(await getDatabase()),
  getAlarmService(),
);

export function useAlarms() {
  return useAlarmStore(alarmStore);
}
