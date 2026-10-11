import { createAndroidAlarmService } from './android-alarm-manager';
import { createIosAlarmService } from './ios-alarmkit';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

export type * from './types';

let service: AlarmService | null = null;

function createForPlatform(): AlarmService {
  switch (process.env.EXPO_OS) {
    case 'ios':
      return createIosAlarmService(); // AlarmKit (iOS 26+)
    case 'android':
      return createAndroidAlarmService(); // AlarmManager.setAlarmClock
    default:
      return createNotImplementedAlarmService(); // web preview never rings
  }
}

/**
 * Returns the alarm service for this platform: AlarmKit on iOS 26+,
 * AlarmManager on Android (development/release builds with the native
 * module), otherwise one that reports `not-implemented` and never claims an
 * alarm was scheduled or fired (Expo Go, web, tests).
 */
export function getAlarmService(): AlarmService {
  service ??= createForPlatform();
  return service;
}
