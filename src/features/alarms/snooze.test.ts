import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildToday } from '@/features/today/today';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { xpForMorning } from '@/features/progress/progression';
import { alarmKitFireEvents, isNativeUpToDate, snoozeRings } from '@/services/alarm-scheduler/native-records';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmFiredEvent, AlarmService, SnoozeRing } from '@/services/alarm-scheduler';
import type { NativeAlarmAction, NativeRecordPayload } from '../../../modules/terbit-alarms';

import { createAlarmDraft, type AlarmDraft, type SnoozePreference } from './alarm';
import { createAlarmHandOff } from './alarm-handoff';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore, snoozeOffsetsFor, toAlarmSpec } from './alarm-store';
import { applyMainWakeUpChoice } from './morning';
import { createOccurrenceManager } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { snoozeSchedule } from './snooze';

const root = join(__dirname, '..', '..', '..');
const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m).getTime(); // Wednesday
const MIN = 60_000;
const snooze = (minutes: 5 | 10 | 15, maxSnoozes: 1 | 2 | 3 | 5, enabled = true): SnoozePreference => ({ enabled, minutes, maxSnoozes });
const main = (o: Partial<AlarmDraft> = {}) => ({ hour: 6, minute: 30, isPrimary: true, snooze: snooze(10, 3), ...o });

describe('scheduling: native rings use the same calculation as the Preview', () => {
  it.each([5, 10, 15] as const)('%i-minute interval', (minutes) => {
    expect(snoozeOffsetsFor(main({ snooze: snooze(minutes, 3) }))).toEqual([minutes, minutes * 2, minutes * 3]);
  });

  it.each([1, 2, 3, 5] as const)('maximum %i: exactly that many snooze rings', (max) => {
    const offsets = snoozeOffsetsFor(main({ snooze: snooze(10, max) }));
    expect(offsets).toHaveLength(max);
    expect(offsets).toEqual(snoozeSchedule({ hour: 6, minute: 30 }, snooze(10, max)).slice(1).map((r) => r.offsetMinutes));
  });

  it('snooze off, or not the Main Wake-Up: no snooze rings at all', () => {
    expect(snoozeOffsetsFor(main({ snooze: snooze(10, 3, false) }))).toEqual([]);
    expect(snoozeOffsetsFor(main({ isPrimary: false }))).toEqual([]);
  });

  it('the final ring is identified, and times cross the hour and midnight like the Preview', () => {
    const rings = snoozeSchedule({ hour: 23, minute: 45 }, snooze(15, 2));
    expect(rings.map((r) => [r.hour, r.minute, r.label])).toEqual([
      [23, 45, 'Alarm'],
      [0, 0, 'Snooze 1'],
      [0, 15, 'Final snooze'],
    ]);
    expect(snoozeOffsetsFor(main({ hour: 23, minute: 45, snooze: snooze(15, 2) }))).toEqual([15, 30]);
  });

  it('the native alarm gets the offsets and a "Snooze N min" button label', () => {
    const alarm = { ...createAlarmDraft(main()), id: 'a', createdAt: 0, updatedAt: 0 };
    expect(toAlarmSpec(alarm, at(5))).toMatchObject({ snoozeOffsetsMinutes: [10, 20, 30], snoozeLabel: 'Snooze 10 min' });
  });

  it('the native snooze stops at the maximum: the last ring offers the mission, never another Snooze', () => {
    const swift = readFileSync(join(root, 'modules/terbit-alarms/ios/NativeSnooze.swift'), 'utf8');
    expect(swift).toContain('nextIndex <= offsets.count');
    expect(swift).toMatch(/let isFinal = nextIndex >= offsets\.count[\s\S]*isFinal\s*\? \.mission/);
  });
});

/** iOS records as the native module reports them. */
const saved = (o: Partial<NativeRecordPayload> = {}): NativeRecordPayload => ({
  kind: 'saved',
  alarmId: 'main',
  occurrenceId: null,
  nativeId: 'n-main',
  fireAt: at(6, 30),
  createdAt: at(1),
  state: 'scheduled',
  firedAt: null,
  stoppedAt: null,
  cancelledAt: null,
  hour: 6,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
  completionMode: 'challenge',
  actionLabel: 'Stop & Start Mission',
  snoozeOffsets: [10, 20, 30],
  ...o,
});
const ring = (index: number, o: Partial<NativeRecordPayload> = {}): NativeRecordPayload => ({
  ...saved(),
  kind: 'snooze',
  nativeId: `n-snooze-${index}`,
  fireAt: at(6, 30) + index * 10 * MIN,
  createdAt: at(6, 30) + (index - 1) * 10 * MIN + MIN,
  hour: null,
  minute: null,
  weekdays: null,
  snoozeIndex: index,
  originAt: at(6, 30),
  state: 'finished',
  ...o,
});
const tap = (action: NativeAlarmAction['action'], minutesAfter: number, nativeId = 'n-main'): NativeAlarmAction => ({
  alarmId: 'main',
  nativeId,
  action,
  at: at(6, 30) + minutesAfter * MIN,
});

describe('one occurrence: every snooze ring belongs to the same morning', () => {
  it('snooze rings never create mornings; a Snooze tap is never a stop', () => {
    const records = [saved(), ring(1), ring(2)];
    const events = alarmKitFireEvents(records, at(0), at(8), [tap('snooze', 1), tap('snooze', 11, 'n-snooze-1')]);
    expect(events).toEqual([
      { alarmId: 'main', scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null },
    ]);
  });

  it('the final ring’s Stop & Start Mission (or Stop) ends that same morning', () => {
    const actions = [tap('snooze', 1), tap('snooze', 11, 'n-snooze-1'), tap('snooze', 21, 'n-snooze-2'), tap('mission', 31, 'n-snooze-3')];
    const events = alarmKitFireEvents([saved(), ring(1), ring(2), ring(3)], at(0), at(8), actions);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scheduledAt: at(6, 30), stopAction: 'mission', stoppedAt: at(6, 30) + 31 * MIN });
    // The longest sequence (5 × 15 min) still matches its morning.
    const late = alarmKitFireEvents([saved()], at(0), at(9), [tap('snooze', 1), tap('stop', 76)]);
    expect(late[0]).toMatchObject({ stopAction: 'stop' });
  });

  it('snooze rings are read back with their morning and number', () => {
    expect(snoozeRings([saved(), ring(1), ring(2, { state: 'scheduled' })])).toEqual([
      expect.objectContaining({ index: 1, total: 3, originAt: at(6, 30), pending: false }),
      expect.objectContaining({ index: 2, total: 3, originAt: at(6, 30), pending: true }),
    ]);
  });

  it('a change to snooze settings re-creates the native alarm (no stale snooze rings)', () => {
    const alarm = { ...createAlarmDraft(main()), id: 'main', createdAt: 0, updatedAt: 0 };
    const spec = toAlarmSpec(alarm, at(5));
    expect(isNativeUpToDate([saved({ completionMode: 'reward', actionLabel: spec.actionLabel })], spec, 'alarmkit')).toBe(true);
    const fewer = toAlarmSpec({ ...alarm, snooze: snooze(10, 1) }, at(5));
    expect(isNativeUpToDate([saved({ completionMode: 'reward', actionLabel: spec.actionLabel })], fewer, 'alarmkit')).toBe(false);
  });
});

function setup(mode: 'reward' | 'gentle' | 'challenge' = 'challenge') {
  const clock = { time: at(6, 0) };
  const now = () => clock.time;
  const events: AlarmFiredEvent[] = [];
  const rings: SnoozeRing[] = [];
  const cancelled: string[] = [];
  const service: AlarmService = {
    ...createNotImplementedAlarmService(),
    schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
    cancel: jest.fn(async () => {}),
    syncAll: jest.fn(async () => {}),
    getFireEvents: jest.fn(async () => events),
    listSnoozes: jest.fn(async () => rings),
    cancelSnoozes: jest.fn(async (id: string) => {
      cancelled.push(id);
      for (const r of rings) if (r.alarmId === id) r.pending = false;
    }),
  };
  const occurrenceRepository = createMemoryOccurrenceRepository();
  const occurrences = createOccurrenceManager(async () => occurrenceRepository, now);
  const alarmRepository = createMemoryAlarmRepository();
  const alarmStore = createAlarmStore(async () => alarmRepository, service, { now });
  const scheduledReminders = new Map<string, number>();
  const reminders = {
    schedule: jest.fn(async (r: { id: string; fireAt: number }) => void scheduledReminders.set(r.id, r.fireAt)),
    cancel: jest.fn(async (id: string) => void scheduledReminders.delete(id)),
  };
  const handOff = createAlarmHandOff({ alarmStore, occurrences, service, reminders, now });
  const draft = createAlarmDraft({ ...main(), completionMode: mode, mission: { type: 'math', difficulty: 'easy', questionCount: 3 } });
  return { clock, events, rings, cancelled, service, occurrences, alarmStore, handOff, draft, scheduledReminders, occurrenceRepository, alarmRepository };
}

const snoozeRing = (alarmId: string, index: number, pending: boolean): SnoozeRing => ({
  alarmId,
  nativeId: `n-${index}`,
  index,
  total: 3,
  originAt: at(6, 30),
  fireAt: at(6, 30) + index * 10 * MIN,
  pending,
});

const mathDone = { difficulty: 'easy' as const, questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 1 };

describe('one morning through the hand-off', () => {
  it('two snoozes: one morning, snooze count 2, the same mission; one XP award and one Challenge bonus', async () => {
    const ctx = setup('challenge');
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, false), snoozeRing(alarm.id, 2, true));
    ctx.clock.time = at(6, 45);

    await ctx.handOff.sync();
    await ctx.handOff.sync(); // repeated runs change nothing
    const mornings = await ctx.occurrences.listSince(0);
    expect(mornings).toHaveLength(1);
    expect(mornings[0]).toMatchObject({ scheduledAt: at(6, 30), snoozeCount: 2, isMainWakeUp: true, mission: alarm.mission });
    expect(ctx.handOff.pendingSnoozes().get(alarm.id)).toMatchObject({ index: 2, fireAt: at(6, 50) });

    // The mission is done once, after the snoozes.
    await ctx.occurrences.startMission(mornings[0].id);
    const done = await ctx.occurrences.completeMission(mornings[0].id, mathDone);
    const xp = xpForMorning(done, PROGRESSION_POLICY);
    expect(xp.map((e) => e.reason)).toEqual(['mission_completed', 'mode_bonus']);
    expect(done.snoozeCount).toBe(2);
  });

  it('REGRESSION: snooze → open Terbit → see/start the mission → leave the app: the snooze ring stays', async () => {
    const ctx = setup('reward');
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    (ctx.service.schedule as jest.Mock).mockClear();

    ctx.clock.time = at(6, 32);
    const morning = (await ctx.handOff.sync())!; // opening Terbit runs the hand-off
    await ctx.handOff.syncSnoozes(); // the alarm screen re-checks after showing
    await ctx.occurrences.startMission(morning.id); // the mission is viewed and started
    await ctx.handOff.syncSnoozes();
    ctx.clock.time = at(6, 33);
    await ctx.handOff.sync(); // back to the background and to the front again
    await ctx.handOff.sync(); // switching tabs / locking: more hand-off runs

    expect(ctx.cancelled).toEqual([]);
    expect(ctx.service.cancel).not.toHaveBeenCalled();
    expect(ctx.handOff.pendingSnoozes().get(alarm.id)).toMatchObject({ index: 1, fireAt: at(6, 40) });
    expect((await ctx.occurrences.get(morning.id))?.status).toBe('mission_in_progress');
  });

  it('REGRESSION: re-scheduling the alarm on opening keeps the snooze (the native side no longer cancels it)', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    // The app re-syncs native alarms on opening; a re-schedule must not touch snooze rings.
    await ctx.alarmStore.syncNative();
    await ctx.alarmStore.save({ ...alarm }, alarm.id);
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toEqual([]);
    expect(ctx.handOff.pendingSnoozes().has(alarm.id)).toBe(true);
  });

  it('a snoozed morning isn’t closed as overdue while its snoozes run (5 × 15 min)', async () => {
    const ctx = setup('reward');
    const { alarm } = await ctx.alarmStore.save({ ...ctx.draft, snooze: snooze(15, 5) });
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    for (let i = 1; i <= 4; i++) ctx.rings.push({ ...snoozeRing(alarm.id, i, false), total: 5, fireAt: at(6, 30) + i * 15 * MIN });
    ctx.rings.push({ ...snoozeRing(alarm.id, 5, true), total: 5, fireAt: at(7, 45) });
    ctx.clock.time = at(7, 40); // 70 min after the alarm: past the plain 60-minute window
    const morning = (await ctx.handOff.sync())!;
    expect(morning).toMatchObject({ snoozeCount: 5 });
    expect(['alarm_fired', 'mission_in_progress']).toContain(morning.status);
  });

  it('finishing the morning early cancels the snooze ring still to come', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    ctx.clock.time = at(6, 35);
    const morning = (await ctx.handOff.sync())!;
    expect(ctx.cancelled).toEqual([]);
    await ctx.occurrences.startMission(morning.id);
    await ctx.occurrences.completeMission(morning.id, mathDone);
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toEqual([alarm.id]);
    expect(ctx.handOff.pendingSnoozes().size).toBe(0);
  });

  it('a pending snooze survives a JavaScript restart: a fresh hand-off rebuilds it from the native records', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    ctx.clock.time = at(6, 35);
    await ctx.handOff.sync();

    // Restart: new JavaScript objects; only the saved alarms, mornings and native records remain.
    const now = () => ctx.clock.time;
    const restartedStore = createAlarmStore(async () => ctx.alarmRepository, ctx.service, { now });
    await restartedStore.load();
    const restarted = createAlarmHandOff({
      alarmStore: restartedStore,
      occurrences: createOccurrenceManager(async () => ctx.occurrenceRepository, now),
      service: ctx.service,
      now,
    });
    expect(restarted.pendingSnoozes().size).toBe(0);
    await restarted.sync();
    expect(restarted.pendingSnoozes().get(alarm.id)).toMatchObject({ index: 1, fireAt: at(6, 40) });
    expect(ctx.cancelled).toEqual([]); // nothing was cancelled by the restart
    const mornings = await ctx.occurrences.listSince(0);
    expect(mornings).toHaveLength(1);
    expect(mornings[0].snoozeCount).toBe(1);
  });

  it('a deleted alarm, or one that is no longer the Main Wake-Up, has its pending snooze cancelled', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    await ctx.alarmStore.save({ ...alarm, isPrimary: false }, alarm.id);
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toContain(alarm.id);

    const other = setup();
    const { alarm: gone } = await other.alarmStore.save(other.draft);
    other.rings.push(snoozeRing(gone.id, 1, true));
    await other.alarmStore.remove(gone.id);
    expect(other.service.cancel).toHaveBeenCalledWith(gone.id); // native: cancels its snooze rings too
    await other.handOff.syncSnoozes();
    expect(other.cancelled).toContain(gone.id);
  });

  it('turning the alarm off cancels everything natively, including a pending snooze', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    await ctx.alarmStore.setEnabled(alarm.id, false);
    expect(ctx.service.cancel).toHaveBeenCalledWith(alarm.id);
  });

  it('replacing the Main Wake-Up (same days) deletes the old one straight away: its alarm and pending snoozes are cancelled; the new snooze settings apply', async () => {
    const ctx = setup();
    const { alarm: old } = await ctx.alarmStore.save(ctx.draft);
    const { alarm: next } = await ctx.alarmStore.save(applyMainWakeUpChoice(createAlarmDraft({ hour: 7, minute: 0 }), 'replace'));
    expect(await ctx.alarmStore.find(old.id)).toBeNull();
    expect(ctx.service.cancel).toHaveBeenCalledWith(old.id);
    expect(ctx.cancelled).toContain(old.id);
    expect(ctx.service.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: next.id, snoozeOffsetsMinutes: [10, 20, 30] }));
  });

  it('replacing only some days: the old Main Wake-Up keeps its other days; a pending snooze from a handed-over day is cancelled', async () => {
    const ctx = setup();
    const { alarm: old } = await ctx.alarmStore.save(ctx.draft); // Mon–Fri 06:30
    ctx.rings.push(snoozeRing(old.id, 1, true)); // this Wednesday's morning
    await ctx.alarmStore.save(applyMainWakeUpChoice(createAlarmDraft({ hour: 7, minute: 30, weekdays: [3] }), 'replace'));
    expect(await ctx.alarmStore.find(old.id)).toMatchObject({ isPrimary: true, enabled: true, weekdays: [1, 2, 4, 5] });
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toContain(old.id);
  });

  it('editing the time cancels the pending snooze (it no longer matches the alarm); other edits keep it', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    await ctx.alarmStore.save({ ...alarm, label: 'Subuh' }, alarm.id);
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toEqual([]);
    await ctx.alarmStore.save({ ...alarm, hour: 7 }, alarm.id);
    expect(ctx.service.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: alarm.id, hour: 7 }));
    await ctx.handOff.syncSnoozes();
    expect(ctx.cancelled).toEqual([alarm.id]);
  });

  it('native re-scheduling never cancels a pending snooze ring; only turning off / deleting does', () => {
    const swift = readFileSync(join(root, 'modules/terbit-alarms/ios/TerbitAlarmsModule.swift'), 'utf8');
    expect(swift.match(/cancelActive\(alarmId: options\.alarmId, in: &records, keepingSnoozes: true\)/g)).toHaveLength(2);
    expect(swift).toMatch(/if keepingSnoozes && records\[index\]\.kind == "snooze" \{ continue \}/);
    // cancelAsync (turn off / delete) still cancels everything, snooze rings included.
    expect(swift).toMatch(/AsyncFunction\("cancelAsync"\)[\s\S]*?cancelActive\(alarmId: alarmId, in: &records\)/);
  });
});

describe('modes: snooze and Gentle follow-ups stay separate', () => {
  it.each(['reward', 'challenge'] as const)('%s: snoozing creates no Gentle follow-up', async (mode) => {
    const ctx = setup(mode);
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, true));
    ctx.clock.time = at(6, 35);
    await ctx.handOff.sync();
    expect(ctx.scheduledReminders.size).toBe(0);
  });

  it('Gentle: no follow-up while snoozing; one follow-up after the final stop', async () => {
    const ctx = setup('gentle');
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    const event: AlarmFiredEvent = { alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null };
    ctx.events.push(event);
    ctx.rings.push(snoozeRing(alarm.id, 1, false), snoozeRing(alarm.id, 2, true));
    ctx.clock.time = at(6, 45);
    await ctx.handOff.sync();
    expect(ctx.scheduledReminders.size).toBe(0); // snoozed: still ringing on and off, nothing to follow up yet

    // The last ring is stopped with the phone's Stop: the Gentle follow-up starts from then.
    ctx.events[0] = { ...event, stoppedAt: at(6, 51), stopAction: 'stop' };
    ctx.rings[1].pending = false;
    ctx.clock.time = at(6, 52);
    const morning = (await ctx.handOff.sync())!;
    expect([...ctx.scheduledReminders.values()]).toEqual([at(6, 51) + 10 * MIN]);
    expect(morning.snoozeCount).toBe(2);
    expect((await ctx.occurrences.listSince(0)).length).toBe(1);
  });
});

describe('Today: one Main Wake-Up row, even while snoozed', () => {
  it('shows “Snoozed” on the same row and never lists snooze rings as alarms', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(ctx.draft);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system', stoppedAt: null, stopAction: null });
    ctx.rings.push(snoozeRing(alarm.id, 1, false), snoozeRing(alarm.id, 2, true));
    ctx.clock.time = at(6, 45);
    await ctx.handOff.sync();
    const plan = buildToday({
      alarms: ctx.alarmStore.getState().alarms,
      occurrences: await ctx.occurrences.listSince(0),
      pendingSnoozes: [...ctx.handOff.pendingSnoozes().values()],
      now: ctx.clock.time,
    });
    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0]).toMatchObject({ isMainWakeUp: true, status: 'in_progress', snoozedUntil: at(6, 50) });
  });
});
