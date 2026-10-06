import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore, useAlarmStore } from './alarm-store';
import { getAlarmService } from '@/services/alarm-scheduler';

const repository = createMemoryAlarmRepository();

/**
 * Web preview only: alarms are kept in memory and are lost when the page
 * reloads. Phones use SQLite (see alarms.ts).
 */
export const alarmStore = createAlarmStore(async () => repository, getAlarmService());

export function useAlarms() {
  return useAlarmStore(alarmStore);
}
