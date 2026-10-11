import { createAlarmHandOff } from './alarm-handoff';
import { withEffectiveSettings } from './alarm-features';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore, useAlarmStore } from './alarm-store';
import { createOccurrenceManager } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { entitlements } from '@/features/entitlements/entitlements';
import { getAlarmService } from '@/services/alarm-scheduler';

const repository = createMemoryAlarmRepository();
const occurrenceRepository = createMemoryOccurrenceRepository();

/*
 * Web preview only: alarms and history are kept in memory and are lost when
 * the page reloads. Phones use SQLite (see alarms.ts). Nothing rings on web.
 */
export const occurrences = createOccurrenceManager(async () => occurrenceRepository);

export const alarmStore = createAlarmStore(async () => repository, getAlarmService(), {
  onRemove: occurrences.cancelForAlarm,
  effective: (alarm) => withEffectiveSettings(alarm, entitlements.check()),
});

export const handOff = createAlarmHandOff({
  alarmStore,
  occurrences,
  service: getAlarmService(),
  beforeSync: entitlements.ensureLoaded,
});

export function useAlarms() {
  return useAlarmStore(alarmStore);
}
