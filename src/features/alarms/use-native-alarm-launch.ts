import { router } from 'expo-router';
import { useEffect } from 'react';

import { getAlarmService, type AlarmFiredEvent } from '@/services/alarm-scheduler';

import { alarmStore, occurrences } from './alarms';
import { OccurrenceError } from './occurrence-manager';

/**
 * Opens the alarm screen when a real system alarm fires. No native alarm
 * implementation exists yet, so today this never fires; it is the hand-off
 * point the AlarmKit and AlarmManager modules will use.
 */
export function useNativeAlarmLaunch() {
  useEffect(() => {
    const service = getAlarmService();
    let active = true;

    async function open(event: AlarmFiredEvent) {
      const alarm = await alarmStore.find(event.alarmId);
      if (!alarm || !active) return;
      try {
        const occurrence = await occurrences.trigger(alarm, { scheduledAt: event.scheduledAt, source: 'native' });
        router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: occurrence.id } });
      } catch (error) {
        // The same alarm event was already handled (e.g. delivered twice).
        if (!(error instanceof OccurrenceError && error.code === 'already-finished')) throw error;
      }
    }

    service.getLaunchEvent().then((event) => event && open(event));
    const unsubscribe = service.addFiredListener(open);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
