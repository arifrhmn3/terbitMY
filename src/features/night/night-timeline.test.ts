import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm, type AlarmDraft } from '@/features/alarms/alarm';

import { createNightRoutineDraft, type NightRoutine, type NightRoutineDraft } from './night-routine';
import {
  availableSleepWindow,
  currentNight,
  nativeRestrictionPlan,
  nightPhase,
  nightWindow,
  restrictionEnd,
  restrictionState,
  tonightItems,
} from './night-timeline';

/** October 2026, local time. Tue 13, Wed 14, Thu 15, Fri 16, Sat 17, Sun 18, Mon 19. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const evening = (day: number) => new Date(2026, 9, day);

const SELECTION = { token: 'opaque-apple-token', applications: 2, categories: 1, webDomains: 0 };
const routine = (o: Partial<NightRoutineDraft> = {}): NightRoutine => ({
  ...createNightRoutineDraft({ selection: SELECTION, ...o }),
  id: 'night',
  createdAt: 0,
  updatedAt: 0,
});
const alarm = (id: string, o: Partial<AlarmDraft>, updatedAt = at(12, 9)): Alarm => ({ ...createAlarmDraft(o), id, createdAt: 0, updatedAt });

/** Weekday Main Wake-Up 06:30 (Mon–Fri) and weekend 08:00 (Sat–Sun). */
const weekday = alarm('weekday', { hour: 6, minute: 30, weekdays: [1, 2, 3, 4, 5], isPrimary: true });
const weekend = alarm('weekend', { hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
const MAINS = [weekday, weekend];

describe('night times (wind-down before bedtime, crossing midnight)', () => {
  it('22:30 wind-down and restrictions → 23:00 bedtime → 06:30 Main Wake-Up the next morning', () => {
    const w = nightWindow(routine(), MAINS, at(14, 12));
    expect(w).toMatchObject({
      evening: '2026-10-14',
      weekday: 3,
      windDownAt: at(14, 22, 30),
      bedtimeAt: at(14, 23),
      restrictionStartAt: at(14, 22, 30),
      restrictionEndAt: at(15, 6, 30),
      endSource: 'main_wake_up',
      mainWakeUp: { alarmId: 'weekday', at: at(15, 6, 30) },
      restricts: true,
    });
    expect(w.windDownAt).toBeLessThan(w.bedtimeAt);
    expect(w.restrictionStartAt).toBe(w.windDownAt);
  });

  it('changing wind-down moves the restriction start; bedtime stays where it is', () => {
    const w = nightWindow(routine({ windDown: { hour: 21, minute: 45 } }), MAINS, at(14, 12));
    expect(w).toMatchObject({ windDownAt: at(14, 21, 45), restrictionStartAt: at(14, 21, 45), bedtimeAt: at(14, 23) });
  });

  it('a bedtime after midnight is still that night (00:30 → the next calendar day)', () => {
    const r = routine({ windDown: { hour: 23, minute: 45 }, bedtime: { hour: 0, minute: 30 } });
    const w = nightWindow(r, MAINS, at(14, 12));
    // Wind-down before midnight, bedtime after: restrictions start at wind-down (the evening before).
    expect(w).toMatchObject({ windDownAt: at(14, 23, 45), bedtimeAt: at(15, 0, 30), restrictionStartAt: at(14, 23, 45), restrictionEndAt: at(15, 6, 30) });
  });

  it('phases: evening, winding down, night', () => {
    const w = nightWindow(routine(), MAINS, at(14, 12));
    expect(nightPhase(w, at(14, 20))).toBe('evening');
    expect(nightPhase(w, at(14, 22, 45))).toBe('wind_down');
    expect(nightPhase(w, at(15, 1))).toBe('night');
  });
});

describe('restrictions end at the next Main Wake-Up (central policy)', () => {
  it('weekday and weekend wake-ups: each night ends at the right morning', () => {
    const r = routine();
    expect(restrictionEnd(r, MAINS, evening(16)).at).toBe(at(17, 8)); // Friday night → Saturday 08:00
    expect(restrictionEnd(r, MAINS, evening(17)).at).toBe(at(18, 8)); // Saturday night → Sunday 08:00
    expect(restrictionEnd(r, MAINS, evening(18)).at).toBe(at(19, 6, 30)); // Sunday night → Monday 06:30
  });

  it('no Main Wake-Up that morning: the fallback morning time, and the night says so', () => {
    const w = nightWindow(routine(), [weekday], at(16, 12)); // Saturday has none
    expect(w).toMatchObject({ restrictionEndAt: at(17, 7), endSource: 'fallback', mainWakeUp: null });
    expect(tonightItems(w).at(-1)).toEqual({ kind: 'no_main_wake_up' });
    // Restrictions still end, at the fallback, on a row of their own.
    expect(tonightItems(w)).toContainEqual({ kind: 'restrictions_end', at: at(17, 7) });
  });

  it('“fixed time” always uses the set time (the Main Wake-Up is still shown)', () => {
    const w = nightWindow(routine({ endRule: 'fixed_time', fallbackEnd: { hour: 6, minute: 0 } }), MAINS, at(14, 12));
    expect(w).toMatchObject({ restrictionEndAt: at(15, 6), endSource: 'fixed_time', mainWakeUp: { alarmId: 'weekday' } });
  });

  it('a Main Wake-Up less than 15 minutes after restrictions start falls back (never a too-short period)', () => {
    const r = routine({ windDown: { hour: 6, minute: 20 }, bedtime: { hour: 6, minute: 25 } });
    expect(restrictionEnd(r, MAINS, evening(14))).toMatchObject({ at: at(15, 7), source: 'fallback' });
  });

  it('a one-off Main Wake-Up that morning (e.g. 05:00 flight) ends restrictions then', () => {
    const early = alarm('flight', { hour: 5, minute: 0, weekdays: [], isPrimary: true }, at(14, 12));
    expect(restrictionEnd(routine(), [...MAINS, early], evening(14))).toMatchObject({ at: at(15, 5), source: 'main_wake_up' });
  });

  it('turned-off or deleted Main Wake-Ups don’t count', () => {
    expect(restrictionEnd(routine(), [{ ...weekday, enabled: false }], evening(14)).source).toBe('fallback');
  });
});

describe('Tonight rows', () => {
  it('wind-down begins with apps restricted → bedtime → Main Wake-Up ends restrictions', () => {
    expect(tonightItems(nightWindow(routine(), MAINS, at(14, 12)))).toEqual([
      { kind: 'wind_down', at: at(14, 22, 30), restrictsApps: true },
      { kind: 'bedtime', at: at(14, 23) },
      { kind: 'main_wake_up', at: at(15, 6, 30), alarmId: 'weekday', endsRestrictions: true },
    ]);
  });

  it('no restrictions: wind-down, bedtime and the Main Wake-Up only', () => {
    expect(tonightItems(nightWindow(routine({ restrictApps: false }), MAINS, at(14, 12)))).toEqual([
      { kind: 'wind_down', at: at(14, 22, 30), restrictsApps: false },
      { kind: 'bedtime', at: at(14, 23) },
      { kind: 'main_wake_up', at: at(15, 6, 30), alarmId: 'weekday', endsRestrictions: false },
    ]);
  });

  it('“fixed time” before the Main Wake-Up: its own “Restrictions end” row', () => {
    const items = tonightItems(nightWindow(routine({ endRule: 'fixed_time', fallbackEnd: { hour: 6, minute: 0 } }), MAINS, at(14, 12)));
    expect(items.map((i) => i.kind)).toEqual(['wind_down', 'bedtime', 'restrictions_end', 'main_wake_up']);
    expect(items[3]).toMatchObject({ endsRestrictions: false });
  });
});

describe('Available Sleep Window (bedtime → Main Wake-Up; not actual sleep)', () => {
  it('23:00 bedtime → 06:30 Main Wake-Up = 7h 30m; wind-down doesn’t change it', () => {
    expect(availableSleepWindow(nightWindow(routine(), MAINS, at(14, 12)))).toEqual({ minutes: 450 });
    expect(availableSleepWindow(nightWindow(routine({ windDown: { hour: 21, minute: 0 } }), MAINS, at(14, 12)))).toEqual({ minutes: 450 });
  });

  it('bedtime after midnight, weekend wake-up, and an earlier one-off Main Wake-Up', () => {
    expect(availableSleepWindow(nightWindow(routine({ windDown: { hour: 23, minute: 45 }, bedtime: { hour: 0, minute: 30 } }), MAINS, at(14, 12)))).toEqual({ minutes: 360 });
    expect(availableSleepWindow(nightWindow(routine(), MAINS, at(16, 12)))).toEqual({ minutes: 540 }); // Fri → Sat 08:00
    const early = alarm('flight', { hour: 5, minute: 0, weekdays: [], isPrimary: true }, at(14, 12));
    expect(availableSleepWindow(nightWindow(routine(), [...MAINS, early], at(14, 12)))).toEqual({ minutes: 360 });
  });

  it('no Main Wake-Up that morning: none (the fallback end time isn’t a wake-up)', () => {
    expect(availableSleepWindow(nightWindow(routine(), [weekday], at(16, 12)))).toBeNull();
  });
});

describe('which night matters now', () => {
  it('01:00: last night (until its end); after the wake-up: tonight', () => {
    expect(currentNight(routine(), MAINS, at(15, 1))?.evening).toBe('2026-10-14');
    expect(currentNight(routine(), MAINS, at(15, 6, 29))?.evening).toBe('2026-10-14');
    expect(currentNight(routine(), MAINS, at(15, 7))?.evening).toBe('2026-10-15');
  });

  it('only on its nights; never when turned off', () => {
    const weeknights = routine({ weekdays: [0, 1, 2, 3, 4] }); // Sun–Thu evenings
    expect(currentNight(weeknights, MAINS, at(16, 20))).toBeNull(); // Friday evening
    expect(currentNight(routine({ enabled: false }), MAINS, at(14, 20))).toBeNull();
  });
});

describe('restriction state: inactive, scheduled, active, overridden, ended', () => {
  const state = (now: number, o: Partial<Parameters<typeof restrictionState>[0]> = {}) =>
    restrictionState({ routine: routine(), alarms: MAINS, now, available: true, ...o });

  it('scheduled in the evening, active from wind-down (before bedtime) overnight, ended in the morning', () => {
    expect(state(at(14, 20))).toEqual({ kind: 'scheduled', startsAt: at(14, 22, 30), endsAt: at(15, 6, 30) });
    expect(state(at(14, 22, 29))).toMatchObject({ kind: 'scheduled' });
    expect(state(at(14, 22, 30))).toEqual({ kind: 'active', endsAt: at(15, 6, 30) }); // wind-down, not bedtime
    expect(state(at(14, 22, 45))).toEqual({ kind: 'active', endsAt: at(15, 6, 30) });
    expect(state(at(14, 23, 30))).toEqual({ kind: 'active', endsAt: at(15, 6, 30) });
    expect(state(at(15, 3))).toEqual({ kind: 'active', endsAt: at(15, 6, 30) });
    expect(state(at(15, 6, 30))).toMatchObject({ kind: 'ended', endedAt: at(15, 6, 30) }); // ends at the Main Wake-Up
    expect(state(at(15, 8))).toEqual({ kind: 'ended', endedAt: at(15, 6, 30), nextStartsAt: at(15, 22, 30) });
    expect(state(at(15, 13))).toMatchObject({ kind: 'scheduled', startsAt: at(15, 22, 30) });
  });

  it('ended early tonight by the user: overridden until the morning, then normal again', () => {
    expect(state(at(14, 23, 30), { override: { until: at(15, 6, 30) } })).toEqual({ kind: 'overridden', endsAt: at(15, 6, 30) });
    expect(state(at(15, 23, 30), { override: { until: at(15, 6, 30) } })).toMatchObject({ kind: 'active' });
  });

  it('inactive without a routine, when off, or with no apps chosen; unavailable without Screen Time', () => {
    expect(state(at(14, 23, 30), { routine: null })).toEqual({ kind: 'inactive' });
    expect(state(at(14, 23, 30), { routine: routine({ enabled: false }) })).toEqual({ kind: 'inactive' });
    expect(state(at(14, 23, 30), { routine: routine({ selection: { token: null, applications: 0, categories: 0, webDomains: 0 } }) })).toEqual({ kind: 'inactive' });
    expect(state(at(14, 23, 30), { routine: routine({ restrictApps: false }) })).toEqual({ kind: 'inactive' });
    expect(state(at(14, 23, 30), { available: false })).toEqual({ kind: 'unavailable' });
  });
});

describe('native schedule (DeviceActivity: runs with Terbit MY closed)', () => {
  it('one repeating schedule per night, crossing midnight to the right weekday (Apple: 1 = Sunday)', () => {
    const plan = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 12) })!;
    expect(plan.nights).toHaveLength(7);
    const byId = Object.fromEntries(plan.nights.map((n) => [n.id, n]));
    // The interval starts at WIND-DOWN (22:30), not bedtime (23:00); it ends at the Main Wake-Up.
    expect(byId['terbit.night.3']).toEqual({ id: 'terbit.night.3', start: { weekday: 4, hour: 22, minute: 30 }, end: { weekday: 5, hour: 6, minute: 30 } }); // Wed → Thu
    expect(plan.nights.every((n) => n.start.hour === 22 && n.start.minute === 30)).toBe(true);
    expect(byId['terbit.night.5'].end).toEqual({ weekday: 7, hour: 8, minute: 0 }); // Fri → Sat 08:00
    expect(byId['terbit.night.6'].end).toEqual({ weekday: 1, hour: 8, minute: 0 }); // Sat → Sun 08:00
    expect(byId['terbit.night.0'].end).toEqual({ weekday: 2, hour: 6, minute: 30 }); // Sun → Mon 06:30
    expect(plan.selection).toBe(SELECTION.token);
    expect(plan.earlyEnds).toEqual([]);
  });

  it('bedtime after midnight: the interval still starts at wind-down that evening', () => {
    const r = routine({ windDown: { hour: 23, minute: 45 }, bedtime: { hour: 0, minute: 30 } });
    const plan = nativeRestrictionPlan({ routine: r, alarms: MAINS, now: at(14, 12) })!;
    expect(plan.nights.find((n) => n.id === 'terbit.night.3')?.start).toEqual({ weekday: 4, hour: 23, minute: 45 }); // Wednesday
  });

  it('wind-down after midnight starts on the next weekday', () => {
    const r = routine({ windDown: { hour: 0, minute: 15 }, bedtime: { hour: 0, minute: 45 } });
    const plan = nativeRestrictionPlan({ routine: r, alarms: MAINS, now: at(14, 12) })!;
    expect(plan.nights.find((n) => n.id === 'terbit.night.3')?.start).toEqual({ weekday: 5, hour: 0, minute: 15 }); // Thursday
  });

  it('a changed wind-down changes the schedule (it is re-applied); bedtime alone does not', () => {
    const before = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 12) })!;
    const after = nativeRestrictionPlan({ routine: routine({ windDown: { hour: 22, minute: 0 } }), alarms: MAINS, now: at(14, 12) })!;
    expect(after.signature).not.toBe(before.signature);
    expect(nativeRestrictionPlan({ routine: routine({ bedtime: { hour: 23, minute: 30 } }), alarms: MAINS, now: at(14, 12) })!.signature).toBe(before.signature);
  });

  it('only the routine’s nights are scheduled', () => {
    const plan = nativeRestrictionPlan({ routine: routine({ weekdays: [0, 1, 2, 3, 4] }), alarms: MAINS, now: at(14, 12) })!;
    expect(plan.nights.map((n) => n.id)).toEqual(['terbit.night.0', 'terbit.night.1', 'terbit.night.2', 'terbit.night.3', 'terbit.night.4']);
  });

  it('bedtime starts nothing: exactly one interval per night, starting at wind-down', () => {
    const plan = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 12) })!;
    expect(new Set(plan.nights.map((n) => n.id)).size).toBe(plan.nights.length);
    expect(plan.nights.some((n) => n.start.hour === 23 && n.start.minute === 0)).toBe(false); // 23:00 bedtime
    expect(plan.earlyEnds).toEqual([]);
  });

  it('a one-off Main Wake-Up LATER than usual keeps the usual end (the safe direction)', () => {
    const late = alarm('late', { hour: 9, minute: 0, weekdays: [], isPrimary: true }, at(14, 12));
    const plan = nativeRestrictionPlan({ routine: routine(), alarms: [...MAINS, late], now: at(14, 12) })!;
    expect(plan.nights.find((n) => n.id === 'terbit.night.3')?.end).toEqual({ weekday: 5, hour: 6, minute: 30 });
    expect(plan.earlyEnds).toEqual([]);
  });

  it('no Main Wake-Up that morning: the interval ends at the fallback time', () => {
    const plan = nativeRestrictionPlan({ routine: routine(), alarms: [weekday], now: at(14, 12) })!;
    expect(plan.nights.find((n) => n.id === 'terbit.night.5')?.end).toEqual({ weekday: 7, hour: 7, minute: 0 }); // Fri → Sat 07:00
  });

  it('a one-off Main Wake-Up earlier than usual adds a dated “end early” marker for that night only', () => {
    const early = alarm('flight', { hour: 5, minute: 0, weekdays: [], isPrimary: true }, at(14, 12));
    const plan = nativeRestrictionPlan({ routine: routine(), alarms: [...MAINS, early], now: at(14, 12) })!;
    expect(plan.nights.find((n) => n.id === 'terbit.night.3')?.end).toEqual({ weekday: 5, hour: 6, minute: 30 }); // the usual pattern stays
    expect(plan.earlyEnds).toEqual([{ id: 'terbit.night.end.2026-10-15', year: 2026, month: 10, day: 15, hour: 5, minute: 0 }]);
  });

  it('shield now only inside the period and not ended early; the signature ignores the time of day', () => {
    const at2330 = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 23, 30) })!;
    expect(at2330.shieldNow).toBe(true);
    expect(nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 22, 40) })!.shieldNow).toBe(true); // winding down
    expect(nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 22, 20) })!.shieldNow).toBe(false);
    expect(nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 23, 30), override: { until: at(15, 6, 30) } })!.shieldNow).toBe(false);
    const noon = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 12) })!;
    expect(noon.shieldNow).toBe(false);
    expect(noon.signature).toBe(at2330.signature);
  });

  it('a changed Main Wake-Up changes the schedule (it is re-applied)', () => {
    const before = nativeRestrictionPlan({ routine: routine(), alarms: MAINS, now: at(14, 12) })!;
    const after = nativeRestrictionPlan({ routine: routine(), alarms: [{ ...weekday, hour: 6, minute: 0 }, weekend], now: at(14, 12) })!;
    expect(after.signature).not.toBe(before.signature);
  });

  it('nothing to schedule: no routine, turned off, or no apps chosen', () => {
    expect(nativeRestrictionPlan({ routine: null, alarms: MAINS, now: at(14, 12) })).toBeNull();
    expect(nativeRestrictionPlan({ routine: routine({ enabled: false }), alarms: MAINS, now: at(14, 12) })).toBeNull();
    expect(nativeRestrictionPlan({ routine: routine({ restrictApps: false }), alarms: MAINS, now: at(14, 12) })).toBeNull();
  });
});
