import { useEffect } from 'react';

import { alarmStore, handOff, occurrences } from '@/features/alarms/alarms';
import { getReminderService } from '@/services/notifications';
import { getScreenTimeService } from '@/services/screen-time';
import { getDatabase } from '@/services/storage/database';

import { createSqliteNightRoutineRepository } from './night-repository';
import { createNightStore, useNightStore } from './night-store';

const DAY = 24 * 60 * 60 * 1000;

/** The app's Night Routine, saved in SQLite on the phone (never backed up to the cloud). */
export const nightStore = createNightStore({
  getRepository: async () => createSqliteNightRoutineRepository(await getDatabase()),
  screenTime: getScreenTimeService(),
  reminders: getReminderService().available ? getReminderService() : undefined,
  alarms: () => alarmStore.getState().alarms,
  recorded: () => occurrences.listSince(Date.now() - 2 * DAY),
});

export function useNightRoutine() {
  return useNightStore(nightStore);
}

/** How long to wait after an alarm change before re-scheduling (several saves arrive together). */
const ALARM_SYNC_DELAY_MS = 500;

/**
 * Keeps the night schedule matched to the routine and the Main Wake-Up:
 * whenever Terbit MY opens or returns (each alarm hand-off run) and whenever
 * alarms change (the next Main Wake-Up sets when restrictions end).
 * Restrictions themselves never depend on the app being open.
 */
export function useNightSync() {
  useEffect(() => {
    const sync = () => void nightStore.sync().catch(() => {});
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastAlarms = alarmStore.getState().alarms;
    const offAlarms = alarmStore.subscribe(() => {
      const next = alarmStore.getState().alarms;
      if (next === lastAlarms) return;
      lastAlarms = next;
      if (timer) clearTimeout(timer);
      timer = setTimeout(sync, ALARM_SYNC_DELAY_MS);
    });
    const offHandOff = handOff.subscribe(sync);
    return () => {
      if (timer) clearTimeout(timer);
      offAlarms();
      offHandOff();
    };
  }, []);
}
