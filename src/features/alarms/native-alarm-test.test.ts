import { describe, expect, it } from '@jest/globals';

import {
  describeNativeState,
  describeNativeStatus,
  describeScheduleResult,
  formatClockTime,
  nativeTestFireTime,
} from './native-alarm-test';

describe('native alarm test helpers', () => {
  it('schedules two minutes ahead on a whole second', () => {
    const now = new Date(2026, 9, 6, 14, 30, 0, 250).getTime();
    expect(nativeTestFireTime(now)).toBe(new Date(2026, 9, 6, 14, 32, 1, 0).getTime());
    expect(formatClockTime(nativeTestFireTime(now))).toBe('14:32:01');
  });

  it('describes results without claiming an alarm fired', () => {
    const at = new Date(2026, 9, 6, 6, 30, 5).getTime();
    expect(describeScheduleResult({ status: 'scheduled' }, at)).toBe('Scheduled a real system alarm for 06:30:05.');
    expect(describeScheduleResult({ status: 'failed', code: 'unsupported_os', message: 'Needs iOS 26' }, at)).toBe(
      'Not scheduled (unsupported_os): Needs iOS 26',
    );
    expect(describeScheduleResult({ status: 'not-implemented' }, at)).toMatch(/aren’t available/);
  });

  it('describes status', () => {
    expect(
      describeNativeStatus({ available: true, backend: 'alarmkit', permission: 'undetermined', fullScreenAllowed: null, detail: null }),
    ).toBe('AlarmKit: permission not asked yet.');
    expect(
      describeNativeStatus({ available: false, backend: 'none', permission: 'unavailable', fullScreenAllowed: null, detail: 'Use the dev build.' }),
    ).toBe('Use the dev build.');
  });

  it('describes native states in plain words', () => {
    expect(describeNativeState('alerting')).toBe('Ringing now');
    expect(describeNativeState('something-new')).toBe('something-new');
  });
});
