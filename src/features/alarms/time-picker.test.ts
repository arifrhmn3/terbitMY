import { describe, expect, it } from '@jest/globals';

import { pickerDateFor, timeFromPickerDate } from './time-picker';

describe('time picker values', () => {
  it('round-trips every hour and minute', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 1, 29, 30, 59]) {
        expect(timeFromPickerDate(pickerDateFor(hour, minute))).toEqual({ hour, minute });
      }
    }
  });

  it('reads only the time from whatever date the picker returns', () => {
    expect(timeFromPickerDate(new Date(2031, 5, 17, 6, 45, 33))).toEqual({ hour: 6, minute: 45 });
  });
});
