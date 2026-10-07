import { TerbitAlarms } from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

/**
 * Android: AlarmManager.setAlarmClock, via the Kotlin code in
 * modules/terbit-alarms/android. The native side repeats weekly alarms
 * itself, records each fire and how it was stopped, and reschedules after a
 * restart or time change. See docs/NATIVE-ALARMS.md.
 */
export function createAndroidAlarmService(): AlarmService {
  return TerbitAlarms
    ? createNativeAlarmService(TerbitAlarms, 'alarm-manager')
    : createNotImplementedAlarmService(
        'Alarms are saved on this phone, but they can’t ring in Expo Go. Use the Terbit MY development build.',
      );
}
