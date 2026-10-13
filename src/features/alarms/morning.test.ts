import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMorning } from '@/features/progress/example-mornings';
import { dayKeyAtOffset } from '@/features/progress/day';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { summarise } from '@/features/progress/progression';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';

import { createAlarmDraft, type Alarm, type AlarmDraft, type SnoozePreference, type Weekday } from './alarm';
import { ALARM_DEFAULTS } from './alarm-defaults';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { createAlarmStore, snoozeOffsetsFor } from './alarm-store';
import { describeDays, mainWakeUpIdForDate } from './main-wake-up';
import { mainWakeUpPrompt } from './main-wake-up-prompt';
import {
  applyMainWakeUpChoice,
  isInMorningWindow,
  isOneOff,
  mainWakeUpQuestion,
  MORNING_WINDOW,
  routineContextFor,
} from './morning';
import { snoozeSchedule } from './snooze';

const root = join(__dirname, '..', '..', '..');
const alarm = (id: string, o: Partial<AlarmDraft>): Alarm => ({ ...createAlarmDraft(o), id, createdAt: 0, updatedAt: 0 });

describe('Morning window (central, prototype)', () => {
  it('is 03:00 until 11:00, defined in one place', () => {
    expect(MORNING_WINDOW).toEqual({ startMinutes: 180, endMinutes: 660 });
    expect(isInMorningWindow({ hour: 2, minute: 59 })).toBe(false);
    expect(isInMorningWindow({ hour: 3, minute: 0 })).toBe(true);
    expect(isInMorningWindow({ hour: 6, minute: 30 })).toBe(true);
    expect(isInMorningWindow({ hour: 10, minute: 59 })).toBe(true);
    expect(isInMorningWindow({ hour: 11, minute: 0 })).toBe(false);
    expect(routineContextFor({ hour: 6, minute: 30 })).toBe('morning');
    expect(routineContextFor({ hour: 18, minute: 0 })).toBe('day');
  });

  it('a different window can be passed in (ready for a personalised Morning Routine)', () => {
    expect(isInMorningWindow({ hour: 11, minute: 30 }, { startMinutes: 600, endMinutes: 720 })).toBe(true);
  });

  it('no screen hard-codes morning clock checks', () => {
    for (const file of ['src/app/(tabs)/alarms/create/time.tsx', 'src/features/alarms/components/alarm-editor.tsx', 'src/app/(tabs)/today/index.tsx']) {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/hour\s*[<>]=?\s*\d|MORNING_WINDOW/);
    }
  });
});

/** Tuesday 13 Oct 2026, 05:00 local. */
const NOW = new Date(2026, 9, 13, 5, 0).getTime();
const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0).getTime();
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const main = (id: string, o: Partial<AlarmDraft> = {}): Alarm => ({ ...alarm(id, { isPrimary: true, weekdays: WEEKDAYS, ...o }), updatedAt: NOW });

describe('Main Wake-Up question: one Main Wake-Up per day', () => {
  const draft = (o: Partial<AlarmDraft> = {}) => createAlarmDraft({ hour: 6, minute: 30, ...o });
  const q = (d: AlarmDraft, alarms: Alarm[], alarmId?: string) => mainWakeUpQuestion(d, alarms, { alarmId, now: NOW });

  it('a new morning alarm on days that have no Main Wake-Up: offer it (never automatic, even for the first alarm)', () => {
    expect(draft().isPrimary).toBe(false);
    expect(q(draft(), [])).toEqual({ kind: 'offer_main' });
    expect(q(draft({ weekdays: [0, 6] }), [main('wk')])).toEqual({ kind: 'offer_main' }); // weekend: free
    expect(q(draft({ hour: 20 }), [])).toEqual({ kind: 'none' }); // not a morning alarm
  });

  it('weekday and weekend Main Wake-Ups don’t overlap: both allowed, nothing to ask', () => {
    expect(q(draft({ hour: 8, weekdays: [0, 6], isPrimary: true }), [main('wk')])).toEqual({ kind: 'none' });
  });

  it('partial overlap: only Wednesday is in question', () => {
    const weekday = main('wk');
    expect(q(draft({ hour: 7, minute: 30, weekdays: [3], isPrimary: true }), [weekday])).toEqual({
      kind: 'replace_days',
      days: [3],
      current: [weekday],
      deleting: [],
      explicit: true,
    });
    expect(q(draft({ hour: 7, minute: 30, weekdays: [3] }), [weekday])).toMatchObject({ kind: 'replace_days', explicit: false });
  });

  it('full overlap: all of those days', () => {
    expect(q(draft({ hour: 7, isPrimary: true }), [main('wk')])).toMatchObject({ kind: 'replace_days', days: WEEKDAYS });
  });

  it('a one-off on a day a repeating Main Wake-Up covers: a date override (this Tuesday only)', () => {
    const weekday = main('wk');
    expect(q(draft({ hour: 7, minute: 30, weekdays: [], isPrimary: true }), [weekday])).toEqual({
      kind: 'date_override',
      weekday: 2,
      current: weekday,
      explicit: true,
    });
  });

  it('a one-off on a date that already has a one-off Main Wake-Up: replace that one', () => {
    const once = main('once', { hour: 7, minute: 0, weekdays: [] });
    expect(q(draft({ hour: 7, minute: 30, weekdays: [], isPrimary: true }), [once])).toMatchObject({ kind: 'replace_date', current: once });
  });

  it('no question when nothing changes, for turned-off alarms, or for ordinary edits', () => {
    const weekday = main('wk');
    expect(q({ ...weekday, label: 'Subuh' }, [weekday], 'wk')).toEqual({ kind: 'none' });
    expect(q(draft({ enabled: false, isPrimary: true }), [weekday])).toEqual({ kind: 'none' });
    expect(q(draft({ hour: 9 }), [weekday], 'other')).toEqual({ kind: 'none' });
  });

  it('the answers', () => {
    expect(applyMainWakeUpChoice(draft(), 'use_as_main')).toMatchObject({ isPrimary: true });
    expect(applyMainWakeUpChoice(draft(), 'replace')).toMatchObject({ isPrimary: true, weekdays: WEEKDAYS });
    const kept = applyMainWakeUpChoice(draft(), 'keep_existing');
    expect(kept).toMatchObject({ isPrimary: false, weekdays: [] });
    expect(isOneOff(kept)).toBe(true);
    expect(applyMainWakeUpChoice(draft(), 'not_now')).toEqual(draft());
  });

  it('plain wording: which days, and what replacing does', () => {
    const weekday = main('wk');
    const partial = mainWakeUpPrompt(q(draft({ hour: 7, minute: 30, weekdays: [3], isPrimary: true }), [weekday]), draft({ hour: 7, minute: 30 }))!;
    expect(partial.title).toBe('Wednesday already has a Main Wake-Up at 06:30.');
    expect(partial.buttons.map((b) => b.label)).toEqual(['Replace Wednesday’s Main Wake-Up', 'Cancel']);
    const full = mainWakeUpPrompt(q(draft({ hour: 7, isPrimary: true }), [weekday]), draft({ hour: 7 }))!;
    expect(full.title).toBe('Monday–Friday already have a Main Wake-Up at 06:30.');
    const override = mainWakeUpPrompt(q(draft({ hour: 7, minute: 30, weekdays: [], isPrimary: true }), [weekday]), draft({ hour: 7, minute: 30 }))!;
    expect(override.title).toBe('Use 07:30 as this Tuesday’s Main Wake-Up?');
    expect(override.buttons[0]).toMatchObject({ label: 'Use for this Tuesday', choice: 'use_as_main' });
    expect(mainWakeUpPrompt({ kind: 'none' }, draft())).toBeNull();
    expect(describeDays([1, 2, 4, 5])).toBe('Monday, Tuesday, Thursday and Friday');
  });
});

function store() {
  const repository = createMemoryAlarmRepository();
  return { repository, store: createAlarmStore(async () => repository, createNotImplementedAlarmService(), { now: () => NOW }) };
}

describe('saving applies the rule (history is never touched)', () => {
  it('weekday and weekend Main Wake-Ups both stay', async () => {
    const { store: s } = store();
    await s.load();
    await s.save(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true }));
    await s.save(createAlarmDraft({ hour: 8, minute: 0, weekdays: [0, 6], isPrimary: true }));
    expect(s.getState().alarms.filter((a) => a.isPrimary)).toHaveLength(2);
  });

  it('partial replacement hands over only Wednesday', async () => {
    const { store: s } = store();
    await s.load();
    const { alarm: old } = await s.save(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true }));
    const { alarm: wed } = await s.save(applyMainWakeUpChoice(createAlarmDraft({ hour: 7, minute: 30, weekdays: [3] }), 'replace'));
    expect(await s.find(old.id)).toMatchObject({ isPrimary: true, enabled: true, weekdays: [1, 2, 4, 5], hour: 6, minute: 30 });
    expect(await s.find(wed.id)).toMatchObject({ isPrimary: true, weekdays: [3] });
  });

  it('full replacement DELETES the old alarm; its past mornings are unchanged', async () => {
    const { store: s } = store();
    await s.load();
    const { alarm: old } = await s.save(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true }));
    const history = createMemoryOccurrenceRepository();
    const past = buildMorning({ id: 'past', alarmId: old.id, scheduledAt: Date.UTC(2026, 9, 11, 22, 30), outcome: 'completed', mainWakeUp: true });
    await history.insert(past);

    const { alarm: next } = await s.save(applyMainWakeUpChoice(createAlarmDraft({ hour: 7, minute: 0, weekdays: WEEKDAYS }), 'replace'));
    expect(s.getState().alarms.filter((a) => a.isPrimary).map((a) => a.id)).toEqual([next.id]);
    expect(await s.find(old.id)).toBeNull();
    expect(s.getState().alarms.map((a) => a.id)).toEqual([next.id]);
    expect(await history.get('past')).toEqual(past);
    expect((await history.get('past'))?.isMainWakeUp).toBe(true);
  });

  it('a one-off date override leaves the repeating Main Wake-Up intact for other weeks', async () => {
    const { store: s } = store();
    await s.load();
    const { alarm: weekly } = await s.save(createAlarmDraft({ hour: 6, minute: 30, weekdays: WEEKDAYS, isPrimary: true }));
    const { alarm: once } = await s.save(createAlarmDraft({ hour: 7, minute: 30, weekdays: [], isPrimary: true }));
    const alarms = s.getState().alarms;
    expect(await s.find(weekly.id)).toMatchObject({ isPrimary: true, weekdays: WEEKDAYS, enabled: true });
    expect(mainWakeUpIdForDate(alarms, day(13))).toBe(once.id); // this Tuesday
    expect(mainWakeUpIdForDate(alarms, day(20))).toBe(weekly.id); // next Tuesday
    expect(mainWakeUpIdForDate(alarms, day(14))).toBe(weekly.id); // Wednesday
  });

  it('a second one-off Main Wake-Up on the same date replaces the first (deleted)', async () => {
    const { store: s } = store();
    await s.load();
    const { alarm: first } = await s.save(createAlarmDraft({ hour: 7, minute: 0, weekdays: [], isPrimary: true }));
    await s.save(createAlarmDraft({ hour: 7, minute: 30, weekdays: [], isPrimary: true }));
    expect(await s.find(first.id)).toBeNull();
  });
});

describe('which Main Wake-Up applies to a date', () => {
  it('weekday or weekend schedule; none on uncovered days', () => {
    const alarms = [main('wk'), main('we', { hour: 8, weekdays: [6] })];
    expect(mainWakeUpIdForDate(alarms, day(14))).toBe('wk'); // Wednesday
    expect(mainWakeUpIdForDate(alarms, day(17))).toBe('we'); // Saturday
    expect(mainWakeUpIdForDate(alarms, day(18))).toBeNull(); // Sunday
    expect(mainWakeUpIdForDate([{ ...main('wk'), enabled: false }], day(14))).toBeNull();
  });
});

describe('snooze with several Main Wake-Up schedules', () => {
  it('each Main Wake-Up has its own snooze; the right one applies on each date', () => {
    const weekday = main('wk', { snooze: { enabled: true, minutes: 10, maxSnoozes: 3 } });
    const weekend = main('we', { hour: 8, minute: 0, weekdays: [0, 6], snooze: { enabled: true, minutes: 15, maxSnoozes: 1 } });
    expect(snoozeOffsetsFor(weekday)).toEqual([10, 20, 30]);
    expect(snoozeOffsetsFor(weekend)).toEqual([15]);
    expect(mainWakeUpIdForDate([weekday, weekend], day(17))).toBe('we');
    expect(mainWakeUpIdForDate([weekday, weekend], day(16))).toBe('wk');
  });
});

describe('one-off morning alarms', () => {
  it('“Keep existing Main Wake-Up” creates a one-off that turns itself off after its ring', async () => {
    const { store: s } = store();
    await s.load();
    await s.save(createAlarmDraft({ hour: 6, minute: 0, isPrimary: true }));
    const { alarm: once } = await s.save(applyMainWakeUpChoice(createAlarmDraft({ hour: 5, minute: 30 }), 'keep_existing'));
    expect(once).toMatchObject({ weekdays: [], isPrimary: false, enabled: true });
    await s.disableAfterRinging(once.id, once.updatedAt + 60_000);
    expect(await s.find(once.id)).toMatchObject({ enabled: false });
    expect(s.getState().alarms.filter((a) => a.isPrimary)).toHaveLength(1);
  });

  it('never affects the morning streak (only the Main Wake-Up does)', () => {
    const at = (day: number) => Date.UTC(2026, 9, day, 22, 30); // 06:30 MYT next day
    const dayKey = dayKeyAtOffset(480);
    const base = [1, 2, 3].map((d) => buildMorning({ id: `m${d}`, alarmId: 'main', scheduledAt: at(d), outcome: 'completed', mainWakeUp: true }));
    const oneOffs = [4, 5].map((d) => buildMorning({ id: `o${d}`, alarmId: 'once', scheduledAt: at(d), outcome: 'completed', mainWakeUp: false }));
    const run = (history: typeof base) =>
      summarise({ history, ledger: [], unlocked: [], policy: PROGRESSION_POLICY, dayKey, now: at(6) }).morning;
    expect(run([...base, ...oneOffs])).toEqual(run(base));
    expect(run(base)).toMatchObject({ successful: 3, scheduled: 3 });
  });
});

const snooze = (minutes: 5 | 10 | 15, maxSnoozes: 1 | 2 | 3 | 5, enabled = true): SnoozePreference => ({ enabled, minutes, maxSnoozes });
const times = (rings: ReturnType<typeof snoozeSchedule>) => rings.map((r) => `${r.hour}:${String(r.minute).padStart(2, '0')} ${r.label}`);

describe('snooze schedule (one routine, preview only)', () => {
  it('interval and maximum: 6:30 with 3 snoozes 10 min apart', () => {
    expect(times(snoozeSchedule({ hour: 6, minute: 30 }, snooze(10, 3), 'Main Wake-Up'))).toEqual([
      '6:30 Main Wake-Up',
      '6:40 Snooze 1',
      '6:50 Snooze 2',
      '7:00 Final snooze',
    ]);
  });

  it('zero snoozes (snooze off) is one ring; one snooze is the final one', () => {
    expect(times(snoozeSchedule({ hour: 6, minute: 30 }, snooze(10, 3, false)))).toEqual(['6:30 Alarm']);
    expect(times(snoozeSchedule({ hour: 6, minute: 30 }, snooze(5, 1)))).toEqual(['6:30 Alarm', '6:35 Final snooze']);
  });

  it('crosses hour boundaries and midnight', () => {
    expect(times(snoozeSchedule({ hour: 6, minute: 50 }, snooze(15, 2)))).toEqual(['6:50 Alarm', '7:05 Snooze 1', '7:20 Final snooze']);
    expect(times(snoozeSchedule({ hour: 23, minute: 50 }, snooze(10, 3)))).toEqual([
      '23:50 Alarm',
      '0:00 Snooze 1',
      '0:10 Snooze 2',
      '0:20 Final snooze',
    ]);
  });

  it('the maximum is respected for every option', () => {
    for (const max of [1, 2, 3, 5] as const) expect(snoozeSchedule({ hour: 7, minute: 0 }, snooze(5, max))).toHaveLength(max + 1);
    expect(snoozeSchedule({ hour: 7, minute: 0 }, snooze(15, 5)).at(-1)).toMatchObject({ offsetMinutes: 75, hour: 8, minute: 15 });
  });

  it('defaults are central: 10-minute interval, up to 3 snoozes', () => {
    expect(ALARM_DEFAULTS.snooze).toEqual({ enabled: true, minutes: 10, maxSnoozes: 3 });
    expect(createAlarmDraft().snooze).toEqual(ALARM_DEFAULTS.snooze);
  });

  it('snoozes stay one routine: one native alarm per saved alarm, and one morning per ring of the alarm', async () => {
    const { store: s } = store();
    await s.load();
    await s.save(createAlarmDraft({ hour: 6, minute: 30, isPrimary: true, snooze: snooze(10, 5) }));
    expect(s.getState().alarms).toHaveLength(1);
    const morning = buildMorning({ id: 'm', scheduledAt: Date.UTC(2026, 9, 12, 22, 30), outcome: 'completed', mainWakeUp: true });
    const tally = summarise({
      history: [morning],
      ledger: [],
      unlocked: [],
      policy: PROGRESSION_POLICY,
      dayKey: dayKeyAtOffset(480),
      now: Date.UTC(2026, 9, 13, 12),
    }).morning;
    expect(tally).toMatchObject({ scheduled: 1, successful: 1 });
  });
});
