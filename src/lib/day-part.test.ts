import { describe, expect, it } from '@jest/globals';

import { getDayPart, getGreeting, type DayPart } from './day-part';

function at(hour: number, minute = 0) {
  return new Date(2026, 0, 1, hour, minute);
}

describe('getDayPart', () => {
  const cases: [number, DayPart][] = [
    [0, 'night'],
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [23, 'night'],
  ];

  it.each(cases)('hour %i is %s', (hour, expected) => {
    expect(getDayPart(at(hour))).toBe(expected);
  });

  it('treats the minute before a boundary as the earlier part', () => {
    expect(getDayPart(at(4, 59))).toBe('night');
    expect(getDayPart(at(11, 59))).toBe('morning');
  });
});

describe('getGreeting', () => {
  it('greets by part of day', () => {
    expect(getGreeting(at(6))).toBe('Good morning');
    expect(getGreeting(at(23))).toBe('Time to wind down');
  });
});
