import { describe, expect, it, jest } from '@jest/globals';

import { buildToday } from '@/features/today/today';
import { buildWeeklySchedule } from '@/features/today/weekly-schedule';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmService } from '@/services/alarm-scheduler';

import { createAlarmDraft, type Alarm, type AlarmDraft, type Weekday } from './alarm';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore, snoozeOffsetsFor } from './alarm-store';
import {
  isActiveAlarm,
  isExpiredOneOff,
  legacyMainWakeUpFixes,
  mainWakeUpOverlaps,
  nextRingAt,
  resolvedMainWakeUp,
  resolveMainWakeUpOverlaps,
} from './main-wake-up';
import { applyMainWakeUpChoice, mainWakeUpQuestion } from './morning';

/** Tuesday 13 Oct 2026, 05:00 local. */
const NOW = new Date(2026, 9, 13, 5, 0).getTime();
const day = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime();
const MON = 12;
const WED = 14;
const SAT = 17;
const SUN = 18;
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

const saved = (id: string, o: Partial<AlarmDraft>, updatedAt = NOW): Alarm => ({ ...createAlarmDraft(o), id, createdAt: 0, updatedAt });

function setup() {
  const clock = { time: NOW };
  const repository = createMemoryAlarmRepository();
  const service: AlarmService = {
    ...createNotImplementedAlarmService(),
    schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
    cancel: jest.fn(async () => {}),
    cancelSnoozes: jest.fn(async () => {}),
  };
  const removed: string[] = [];
  const make = () =>
    createAlarmStore(async () => repository, service, {
      now: () => clock.time,
      onRemove: async (id) => void removed.push(id),
    });
  const store = make();
  /** Saves after the user's answer to the Main Wake-Up question, like the screens do. */
  async function saveAnswering(draft: AlarmDraft, choice: Parameters<typeof applyMainWakeUpChoice>[1], id?: string) {
    clock.time += 1_000;
    return store.save(applyMainWakeUpChoice(draft, choice), id);
  }
  return { clock, repository, service, removed, store, make, saveAnswering };
}

const ids = (alarms: readonly Alarm[]) => alarms.map((a) => a.id).sort();
const mainOn = (alarms: readonly Alarm[], time: number) => resolvedMainWakeUp(alarms, time)?.id ?? null;

describe('Main Wake-Up matrix (one per calendar date)', () => {
  it('no overlap: both stay, no question asked', async () => {
    const { store, saveAnswering } = setup();
    await store.load();
    const { alarm: a } = await saveAnswering(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS }), 'use_as_main');
    const draftB = createAlarmDraft({ hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
    expect(mainWakeUpQuestion(draftB, store.getState().alarms, { now: NOW })).toEqual({ kind: 'none' });
    const { alarm: b } = await store.save(draftB);
    expect(ids(store.getState().alarms.filter((x) => x.isPrimary))).toEqual(ids([a, b]));
  });

  it('partial overlap: only the overlapping day moves; the old alarm keeps the rest', async () => {
    const { store, saveAnswering } = setup();
    await store.load();
    const { alarm: a } = await saveAnswering(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS }), 'use_as_main');
    const { alarm: wed } = await saveAnswering(createAlarmDraft({ hour: 7, minute: 30, weekdays: [3] }), 'replace');
    const alarms = store.getState().alarms;
    expect(alarms.find((x) => x.id === a.id)).toMatchObject({ weekdays: [1, 2, 4, 5], isPrimary: true, enabled: true });
    expect(mainOn(alarms, day(WED))).toBe(wed.id);
    expect(mainOn(alarms, day(MON))).toBe(a.id);
  });

  it('full overlap: the old alarm is deleted (not left turned off)', async () => {
    const { store, saveAnswering, service, removed } = setup();
    await store.load();
    const { alarm: a } = await saveAnswering(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS }), 'use_as_main');
    const { alarm: b } = await saveAnswering(createAlarmDraft({ hour: 7, minute: 0, weekdays: WEEKDAYS }), 'replace');
    expect(ids(store.getState().alarms)).toEqual([b.id]);
    expect(service.cancel).toHaveBeenCalledWith(a.id);
    expect(service.cancelSnoozes).toHaveBeenCalledWith(a.id);
    expect(removed).toEqual([a.id]);
  });

  it('a new alarm covering MORE days than the old one also deletes it (fully covered)', async () => {
    const { store, saveAnswering } = setup();
    await store.load();
    const { alarm: a } = await saveAnswering(createAlarmDraft({ hour: 6, minute: 30, weekdays: [1, 2] }), 'use_as_main');
    await saveAnswering(createAlarmDraft({ hour: 7, minute: 0, weekdays: WEEKDAYS }), 'replace');
    expect(await store.find(a.id)).toBeNull();
  });

  it('several partial overlaps: each old alarm loses only its own overlapping days', async () => {
    const { store, saveAnswering } = setup();
    await store.load();
    const { alarm: early } = await saveAnswering(createAlarmDraft({ hour: 6, minute: 0, weekdays: [1, 2, 3] }), 'use_as_main');
    const { alarm: late } = await saveAnswering(createAlarmDraft({ hour: 7, minute: 0, weekdays: [4, 5, 6] }), 'use_as_main');
    const draft = createAlarmDraft({ hour: 6, minute: 45, weekdays: [3, 4], isPrimary: true });
    const question = mainWakeUpQuestion(draft, store.getState().alarms, { now: NOW });
    expect(question).toMatchObject({ kind: 'replace_days', days: [3, 4], deleting: [] });
    const { alarm: mid } = await saveAnswering(draft, 'replace');
    expect(await store.find(early.id)).toMatchObject({ weekdays: [1, 2] });
    expect(await store.find(late.id)).toMatchObject({ weekdays: [5, 6] });
    expect(mainOn(store.getState().alarms, day(WED))).toBe(mid.id);
  });

  it('mixed: one fully covered (deleted), one partly (keeps its other days)', () => {
    const tueWed = saved('tw', { hour: 6, minute: 0, weekdays: [2, 3], isPrimary: true });
    const thuSat = saved('ts', { hour: 7, minute: 0, weekdays: [4, 5, 6], isPrimary: true });
    const candidate = createAlarmDraft({ hour: 6, minute: 30, weekdays: [1, 2, 3, 4], isPrimary: true });
    const result = resolveMainWakeUpOverlaps(mainWakeUpOverlaps(candidate, [tueWed, thuSat], undefined, NOW));
    expect(result.remove.map((a) => a.id)).toEqual(['tw']);
    expect(result.update).toEqual([expect.objectContaining({ id: 'ts', weekdays: [5, 6] })]);
  });

  it('tagging updates immediately, and agrees after a restart (Today, weekly view, Manage)', async () => {
    const { store, saveAnswering, make } = setup();
    await store.load();
    await saveAnswering(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS }), 'use_as_main');
    const { alarm: b } = await saveAnswering(createAlarmDraft({ hour: 7, minute: 0, weekdays: WEEKDAYS }), 'replace');
    const today = buildToday({ alarms: store.getState().alarms, occurrences: [], now: day(WED, 5) });
    expect(today.schedule.filter((i) => i.isMainWakeUp).map((i) => i.alarmId)).toEqual([b.id]);
    const week = buildWeeklySchedule({ alarms: store.getState().alarms, now: day(WED, 5) });
    expect(week.flatMap((d) => d.sections.flatMap((s) => s.items)).every((i) => i.alarmId === b.id && i.isMainWakeUp)).toBe(true);

    const restarted = make();
    await restarted.load();
    expect(restarted.getState().alarms).toEqual(store.getState().alarms);
  });

  it('weekday/weekend: A Mon–Fri 06:30 Stretch 3×10 and B Sat–Sun 08:00 Reflection 1×15', async () => {
    const { store } = setup();
    await store.load();
    const { alarm: a } = await store.save(
      createAlarmDraft({
        hour: 6,
        minute: 30,
        weekdays: WEEKDAYS,
        isPrimary: true,
        mission: { type: 'fitness', exercise: 'stretch', difficulty: 'easy' },
        snooze: { enabled: true, minutes: 10, maxSnoozes: 3 },
      }),
    );
    const { alarm: b } = await store.save(
      createAlarmDraft({
        hour: 8,
        minute: 0,
        weekdays: [0, 6],
        isPrimary: true,
        mission: { type: 'reflection', difficulty: 'easy' },
        snooze: { enabled: true, minutes: 15, maxSnoozes: 1 },
      }),
    );
    const alarms = store.getState().alarms;
    expect(mainOn(alarms, day(MON))).toBe(a.id);
    expect(mainOn(alarms, day(SAT))).toBe(b.id);
    expect(mainOn(alarms, day(SUN))).toBe(b.id);
    expect(snoozeOffsetsFor(a)).toEqual([10, 20, 30]);
    expect(snoozeOffsetsFor(b)).toEqual([15]);
    const monday = buildToday({ alarms, occurrences: [], now: day(MON + 7, 5) });
    expect(monday.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([[a.id, true]]);
    const saturday = buildToday({ alarms, occurrences: [], now: day(SAT, 5) });
    expect(saturday.schedule.map((i) => [i.alarmId, i.isMainWakeUp])).toEqual([[b.id, true]]);
    const week = buildWeeklySchedule({ alarms, now: NOW });
    expect(new Set(week.flatMap((d) => d.sections.flatMap((s) => s.items.map((i) => i.alarmId))))).toEqual(new Set([a.id, b.id]));
  });

  it('a one-off Main Wake-Up is its date’s Main Wake-Up only (the repeating one still rings, untagged)', () => {
    const weekly = saved('wk', { hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true });
    const once = saved('once', { hour: 7, minute: 30, weekdays: [], isPrimary: true });
    expect(mainOn([weekly, once], day(13))).toBe('once');
    expect(mainOn([weekly, once], day(20))).toBe('wk');
    expect(mainOn([weekly, once], day(WED))).toBe('wk');
  });

  it('never more than one per date, even with conflicting older data', () => {
    const a = saved('a', { hour: 6, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, NOW - 10);
    const b = saved('b', { hour: 7, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, NOW);
    expect(mainOn([a, b], day(WED))).toBe('b');
    expect(mainOn([b, a], day(WED))).toBe('b');
    expect(mainOn([], day(WED))).toBeNull();
    expect(mainOn([{ ...b, enabled: false }], day(WED))).toBeNull();
  });
});

describe('older builds: overlapping Main Wake-Ups are fixed safely when alarms load', () => {
  it('the newest keeps the shared days; an older one loses only those days', () => {
    const old = saved('old', { hour: 6, minute: 0, weekdays: [1, 2, 3, 4, 5, 6], isPrimary: true }, 1);
    const newer = saved('new', { hour: 7, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, 2);
    expect(legacyMainWakeUpFixes([old, newer])).toEqual([{ ...old, weekdays: [6] }]);
  });

  it('an older one with no days left stays saved (same days, still on) but is no longer the Main Wake-Up; nothing is deleted', () => {
    const old = saved('old', { hour: 6, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, 1);
    const newer = saved('new', { hour: 7, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, 2);
    expect(legacyMainWakeUpFixes([old, newer])).toEqual([{ ...old, isPrimary: false }]);
  });

  it('two one-off Main Wake-Ups on the same date: the newer keeps it', () => {
    const first = saved('first', { hour: 7, minute: 0, weekdays: [], isPrimary: true }, NOW);
    const second = saved('second', { hour: 7, minute: 30, weekdays: [], isPrimary: true }, NOW + 1);
    expect(legacyMainWakeUpFixes([first, second])).toEqual([{ ...first, isPrimary: false }]);
  });

  it('nothing to fix: no changes (safe to run every launch)', () => {
    const a = saved('a', { hour: 6, minute: 0, weekdays: WEEKDAYS, isPrimary: true });
    const b = saved('b', { hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true });
    expect(legacyMainWakeUpFixes([a, b])).toEqual([]);
  });

  it('the store applies it on load and saves it', async () => {
    const { repository, make } = setup();
    await repository.save(saved('old', { hour: 6, minute: 0, weekdays: WEEKDAYS, isPrimary: true }, 1));
    await repository.save(saved('new', { hour: 7, minute: 0, weekdays: [3], isPrimary: true }, 2));
    const store = make();
    await store.load();
    expect(await store.find('old')).toMatchObject({ weekdays: [1, 2, 4, 5], isPrimary: true });
    expect((await repository.list()).find((a) => a.id === 'old')?.weekdays).toEqual([1, 2, 4, 5]);
  });
});

describe('active eligibility, one-off expiry and next ring', () => {
  const once = saved('once', { hour: 7, minute: 30, weekdays: [] }); // rings Tue 13 Oct 07:30

  it('a one-off is active until its ring time, then expired', () => {
    expect(isActiveAlarm(once, day(13, 7, 0))).toBe(true);
    expect(isExpiredOneOff(once, day(13, 7, 30))).toBe(true);
    expect(isActiveAlarm(once, day(13, 8))).toBe(false);
    expect(nextRingAt(once, day(13, 7))).toBe(day(13, 7, 30));
    expect(nextRingAt(once, day(13, 8))).toBeNull();
  });

  it('turned off: never active, no next ring; repeating: next ring across days', () => {
    const weekly = saved('wk', { hour: 6, minute: 30, weekdays: [1] });
    expect(isActiveAlarm({ ...weekly, enabled: false }, NOW)).toBe(false);
    expect(nextRingAt({ ...weekly, enabled: false }, NOW)).toBeNull();
    expect(nextRingAt(weekly, NOW)).toBe(day(19, 6, 30)); // next Monday
  });
});
