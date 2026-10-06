import { createAndroidAlarmService } from './android-alarm-manager';
import { createIosAlarmService } from './ios-alarmkit';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

export type * from './types';

let service: AlarmService | null = null;

function createForPlatform(): AlarmService {
  switch (process.env.EXPO_OS) {
    case 'ios':
      return createIosAlarmService(); // placeholder: AlarmKit not implemented
    case 'android':
      return createAndroidAlarmService(); // placeholder: AlarmManager not implemented
    default:
      return createNotImplementedAlarmService(); // web preview never rings
  }
}

/**
 * Returns the alarm service for this platform. Native triggering is NOT
 * implemented on any platform yet; every implementation reports
 * `not-implemented` and never reports a fired alarm.
 */
export function getAlarmService(): AlarmService {
  service ??= createForPlatform();
  return service;
}
