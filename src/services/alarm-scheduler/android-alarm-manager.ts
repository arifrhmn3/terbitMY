import { TerbitAlarms } from '../../../modules/terbit-alarms';

import { createNativeAlarmService } from './native-alarm-service';
import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

const SUMMARY =
  'Your saved alarms can’t ring yet. Android ringing is being built; a one-time native test is under Native alarm test.';

/**
 * Android: AlarmManager.setAlarmClock, via the Kotlin code in
 * modules/terbit-alarms/android.
 *
 * Milestone 1 (implemented, not yet verified on a device): one-time alarms,
 * exact-alarm and notification permission checks, cancel, an alarm receiver
 * that works with the app closed, and a basic native alarm screen. Not yet:
 * the user's repeating alarms, reboot rescheduling, snooze, opening the
 * mission from the alarm. See docs/NATIVE-ALARMS.md.
 */
export function createAndroidAlarmService(): AlarmService {
  return TerbitAlarms
    ? createNativeAlarmService(TerbitAlarms, 'alarm-manager', SUMMARY)
    : createNotImplementedAlarmService(
        'Alarms are saved on this phone, but they can’t ring yet. Android ringing is still being built.',
      );
}
