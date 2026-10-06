import type { NativeAlarmStatus, ScheduleResult } from '@/services/alarm-scheduler';

/** Fixed ID for the developer test alarm, so scheduling again replaces it. */
export const NATIVE_TEST_ALARM_ID = 'native-test';
export const NATIVE_TEST_DELAY_MS = 2 * 60 * 1000;

/** Two minutes from now, on a whole second. */
export function nativeTestFireTime(now: number): number {
  return Math.ceil((now + NATIVE_TEST_DELAY_MS) / 1000) * 1000;
}

export function createTestOccurrenceId(now: number): string {
  return `test-${now.toString(36)}`;
}

export function formatClockTime(ms: number): string {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

const BACKEND_NAME = {
  alarmkit: 'AlarmKit',
  'alarm-manager': 'Android AlarmManager',
  notifications: 'Notifications',
  none: 'None',
} as const;

export function describeNativeStatus(status: NativeAlarmStatus): string {
  if (!status.available) return status.detail ?? 'Native alarms aren’t available here.';
  const name = BACKEND_NAME[status.backend];
  switch (status.permission) {
    case 'granted':
      return status.detail ? `${name}: allowed. ${status.detail}` : `${name}: allowed.`;
    case 'undetermined':
      return `${name}: permission not asked yet.`;
    default:
      return `${name}: not allowed. ${status.detail ?? ''}`.trim();
  }
}

export function describeScheduleResult(result: ScheduleResult, fireAt: number): string {
  switch (result.status) {
    case 'scheduled':
      return `Scheduled a real system alarm for ${formatClockTime(fireAt)}.`;
    case 'permission-denied':
      return `Not scheduled: permission missing. ${result.message ?? ''}`.trim();
    case 'not-implemented':
      return 'Not scheduled: native alarms aren’t available in this build.';
    case 'failed':
      return `Not scheduled (${result.code ?? 'error'}): ${result.message}`;
  }
}

const STATE_TEXT: Record<string, string> = {
  scheduled: 'Scheduled',
  alerting: 'Ringing now',
  countdown: 'Counting down',
  paused: 'Paused',
  fired: 'Went off (not stopped in the alarm screen)',
  stopped: 'Went off and was stopped',
  cancelled: 'Cancelled',
  finished: 'No longer in the system list (went off or was removed)',
  missing: 'Not found in the system',
};

export function describeNativeState(state: string): string {
  return STATE_TEXT[state] ?? state;
}
