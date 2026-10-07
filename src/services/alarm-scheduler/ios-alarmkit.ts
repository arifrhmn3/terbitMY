import { TerbitAlarms } from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

/**
 * iOS: AlarmKit (iOS 26+), via the Swift code in modules/terbit-alarms/ios.
 * Saved alarms are scheduled as AlarmKit alarms (weekly repeats handled by
 * AlarmKit). iOS doesn't tell apps when an alarm fires, so fired alarms are
 * worked out from the schedule when Terbit MY opens.
 * In Expo Go the native module is missing, so this falls back to
 * not-implemented. See docs/NATIVE-ALARMS.md.
 */
export function createIosAlarmService(): AlarmService {
  return TerbitAlarms
    ? createNativeAlarmService(TerbitAlarms, 'alarmkit')
    : createNotImplementedAlarmService(
        'Alarms are saved on this iPhone, but they can’t ring in Expo Go. Use the Terbit MY development build.',
      );
}
