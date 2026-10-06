import { TerbitAlarms } from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

const SUMMARY =
  'Your saved alarms can’t ring yet. iPhone ringing (AlarmKit) is being built; a one-time native test is under Native alarm test.';

/**
 * iOS: AlarmKit (iOS 26+), via the Swift code in modules/terbit-alarms/ios.
 *
 * Milestone 1 (implemented, not yet verified on a device): authorisation,
 * one-time alarms, cancel, state. Not yet: the user's repeating alarms,
 * snooze, opening the mission from the alarm, older-iOS fallback.
 * In Expo Go the native module is missing, so this falls back to
 * not-implemented. See docs/NATIVE-ALARMS.md.
 */
export function createIosAlarmService(): AlarmService {
  return TerbitAlarms
    ? createNativeAlarmService(TerbitAlarms, 'alarmkit', SUMMARY)
    : createNotImplementedAlarmService(
        'Alarms are saved on this iPhone, but they can’t ring yet. iPhone ringing (AlarmKit) is still being built.',
      );
}
