import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from '@/features/alarms/alarm';
import { describeRestriction, tonightRow, tonightTitle, weeklyNightSummary } from '@/features/night/labels';
import { createNightRoutineDraft, type NightRoutine, type NightRoutineDraft } from '@/features/night/night-routine';

import { buildToday } from './today';
import { buildTonight } from './tonight';
import { buildWeeklySchedule } from './weekly-schedule';

/** October 2026, local time. Wed 14, Thu 15, Fri 16, Sat 17. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const SELECTION = { token: 'opaque', applications: 3, categories: 0, webDomains: 0 };
const routine = (o: Partial<NightRoutineDraft> = {}): NightRoutine => ({ ...createNightRoutineDraft({ selection: SELECTION, ...o }), id: 'night', createdAt: 0, updatedAt: 0 });
const main: Alarm = { ...createAlarmDraft({ hour: 6, minute: 30, weekdays: [1, 2, 3, 4, 5], isPrimary: true }), id: 'main', createdAt: 0, updatedAt: 0 };

describe('Today → Tonight', () => {
  it('no Night Routine: one row offering to set one up', () => {
    expect(buildTonight({ routine: null, alarms: [main], now: at(14, 20), restrictionsAvailable: true })).toEqual({ kind: 'no_routine' });
  });

  it('tonight’s plan: 22:30 wind-down with apps restricted, 23:00 bedtime, 06:30 Main Wake-Up ends restrictions', () => {
    const view = buildTonight({ routine: routine(), alarms: [main], now: at(14, 20), restrictionsAvailable: true });
    if (view.kind !== 'night') throw new Error(view.kind);
    expect(view.items.map((i) => [i.kind, 'at' in i ? new Date(i.at).toTimeString().slice(0, 5) : null])).toEqual([
      ['wind_down', '22:30'],
      ['bedtime', '23:00'],
      ['main_wake_up', '06:30'],
    ]);
    expect(view.items.map(tonightRow).map((r) => `${r.time} ${r.title}`)).toEqual([
      '22:30 Wind-down begins · Apps restricted',
      '23:00 Bedtime',
      '06:30 Main Wake-Up tomorrow · Restrictions end',
    ]);
    expect(view).toMatchObject({ phase: 'evening', prominent: false, restriction: { kind: 'scheduled', startsAt: at(14, 22, 30) }, activity: null });
  });

  it('active from wind-down, not bedtime: “Wind-down active”, then “Bedtime”, always “Apps restricted until 06:30”', () => {
    expect(buildTonight({ routine: routine(), alarms: [main], now: at(14, 22, 29), restrictionsAvailable: true })).toMatchObject({ restriction: { kind: 'scheduled' } });
    const winding = buildTonight({ routine: routine(), alarms: [main], now: at(14, 22, 30), restrictionsAvailable: true });
    if (winding.kind !== 'night') throw new Error(winding.kind);
    expect(winding).toMatchObject({ phase: 'wind_down', prominent: true, restriction: { kind: 'active', endsAt: at(15, 6, 30) } });
    expect(tonightTitle(winding.restriction, winding.phase)).toBe('Tonight · Wind-down active');
    expect(describeRestriction(winding.restriction)).toBe('Apps restricted until 06:30');
    const night = buildTonight({ routine: routine(), alarms: [main], now: at(14, 23, 30), restrictionsAvailable: true });
    if (night.kind !== 'night') throw new Error(night.kind);
    expect(tonightTitle(night.restriction, night.phase)).toBe('Tonight · Bedtime');
    // The same period continues: same end, nothing says restrictions "just started".
    expect(describeRestriction(night.restriction)).toBe('Apps restricted until 06:30');
    expect(night.restriction).toEqual(winding.restriction);
  });

  it('restrictions active: shown first on Today (and at 01:00 it is still last night)', () => {
    const view = buildTonight({ routine: routine(), alarms: [main], now: at(15, 1), restrictionsAvailable: true });
    expect(view).toMatchObject({ kind: 'night', prominent: true, restriction: { kind: 'active', endsAt: at(15, 6, 30) }, night: { evening: '2026-10-14' } });
  });

  it('no Main Wake-Up tomorrow: says so plainly (the routine still works)', () => {
    const view = buildTonight({ routine: routine(), alarms: [main], now: at(16, 20), restrictionsAvailable: true }); // Friday → Saturday
    if (view.kind !== 'night') throw new Error(view.kind);
    expect(view.items.at(-1)).toEqual({ kind: 'no_main_wake_up' });
    expect(view.items.map(tonightRow).map((r) => `${r.time} ${r.title}`)).toContain('07:00 Restrictions end');
  });

  it('during wind-down the calming activity is offered (never required)', () => {
    const view = buildTonight({ routine: routine({ activity: 'breathing' }), alarms: [main], now: at(14, 22, 40), restrictionsAvailable: true });
    expect(view).toMatchObject({ kind: 'night', phase: 'wind_down', activity: 'breathing', prominent: true });
    expect(buildTonight({ routine: routine({ activity: 'breathing' }), alarms: [main], now: at(14, 20), restrictionsAvailable: true })).toMatchObject({ activity: null });
  });

  it('not one of its nights: says when the next one is', () => {
    expect(buildTonight({ routine: routine({ weekdays: [0, 1, 2, 3, 4] }), alarms: [main], now: at(16, 20), restrictionsAvailable: true })).toEqual({
      kind: 'not_tonight',
      nextWindDownAt: at(18, 22, 30),
    });
  });

  it('Today’s alarms and morning are unchanged by the Night Routine', () => {
    const plan = buildToday({ alarms: [main], occurrences: [], now: at(15, 5) });
    expect(plan.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([['main', true]]);
    expect(plan.morning).toEqual({ kind: 'ahead', hour: 6, minute: 30 });
  });
});

describe('weekly schedule: the Night Routine once per evening it applies to', () => {
  it('on the right days, one line each, never duplicated', () => {
    const days = buildWeeklySchedule({ alarms: [main], now: at(14, 12), night: routine({ weekdays: [0, 1, 2, 3, 4] }) });
    expect(days.map((d) => [d.title, d.night !== null])).toEqual([
      ['Today', true], // Wednesday
      ['Tomorrow', true], // Thursday
      ['Friday', false],
      ['Saturday', false],
      ['Sunday', true],
      ['Monday', true],
      ['Tuesday', true],
    ]);
    expect(days[0].night).toEqual({ windDownAt: at(14, 22, 30), bedtimeAt: at(14, 23), restrictions: { from: at(14, 22, 30), until: at(15, 6, 30) } });
    expect(weeklyNightSummary(days[0].night!)).toBe('Apps restricted from wind-down · Bedtime 23:00 · Ends 06:30');
    // Alarms are still listed separately; the night is never repeated as an alarm row.
    expect(days[0].sections.flatMap((s) => s.items).map((i) => i.alarmId)).toEqual(['main']);
  });

  it('no routine, or no apps restricted', () => {
    expect(buildWeeklySchedule({ alarms: [main], now: at(14, 12) }).every((d) => d.night === null)).toBe(true);
    const plain = buildWeeklySchedule({ alarms: [main], now: at(14, 12), night: routine({ restrictApps: false }) });
    expect(plain[0].night?.restrictions).toBeNull();
  });
});
