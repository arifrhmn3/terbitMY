import { describe, expect, it, jest } from '@jest/globals';

import { dayKeyAtOffset } from '@/features/progress/day';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { summarise } from '@/features/progress/progression';
import { buildToday } from '@/features/today/today';
import { buildWeeklySchedule } from '@/features/today/weekly-schedule';
import type { AlarmFiredEvent, AlarmService, SnoozeRing } from '@/services/alarm-scheduler';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';

import { createAlarmDraft, type AlarmMission } from './alarm';
import { createAlarmHandOff } from './alarm-handoff';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore } from './alarm-store';
import { groupAlarmsForManage } from './manage';
import { createOccurrenceManager } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';

/** Wednesday 14 Oct 2026, local time. */
const at = (hour: number, minute = 0) => new Date(2026, 9, 14, hour, minute).getTime();

function setup() {
  const clock = { time: at(5) };
  const now = () => clock.time;
  const events: AlarmFiredEvent[] = [];
  const rings: SnoozeRing[] = [];
  const service: AlarmService = {
    ...createNotImplementedAlarmService(),
    schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
    cancel: jest.fn(async () => {}),
    syncAll: jest.fn(async () => {}),
    getFireEvents: jest.fn(async () => events),
    listSnoozes: jest.fn(async () => rings),
    cancelSnoozes: jest.fn(async () => {}),
  };
  const occurrenceRepository = createMemoryOccurrenceRepository();
  const occurrences = createOccurrenceManager(async () => occurrenceRepository, now);
  const reminders = { schedule: jest.fn(async () => {}), cancel: jest.fn(async (_id: string) => {}) };
  // Wired like the app (alarms.ts): deleting closes the open morning and its Gentle reminder.
  const alarmStore = createAlarmStore(async () => createMemoryAlarmRepository(), service, {
    now,
    onRemove: async (id) => {
      await occurrences.cancelForAlarm(id);
      await handOff.syncReminders();
    },
  });
  const handOff = createAlarmHandOff({ alarmStore, occurrences, service, reminders, now });
  return { clock, events, service, occurrences, occurrenceRepository, reminders, alarmStore, handOff };
}

const mission: AlarmMission = { type: 'math', difficulty: 'easy', questionCount: 3 };
const result = { difficulty: 'easy' as const, questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 1 };

describe('deleting a saved alarm (deletion matrix)', () => {
  it('07:00 completed, deleted at 10:00: gone from Today, Next alarm, the weekly view and Manage; its morning, XP day and streak stay', async () => {
    const ctx = setup();
    await ctx.alarmStore.load();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ hour: 7, minute: 0, weekdays: [1, 2, 3, 4, 5], isPrimary: true, mission }));
    ctx.clock.time = at(7, 2);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(7), evidence: 'schedule' });
    await ctx.handOff.sync();
    const [morning] = await ctx.occurrences.listRecent();
    await ctx.occurrences.startMission(morning.id);
    await ctx.occurrences.completeMission(morning.id, result);

    ctx.clock.time = at(10);
    await ctx.alarmStore.remove(alarm.id);

    const alarms = ctx.alarmStore.getState().alarms;
    const history = await ctx.occurrences.listRecent();
    const today = buildToday({ alarms, occurrences: history, now: at(10) });
    expect(today.schedule).toEqual([]);
    expect(today.next).toBeNull();
    expect(buildWeeklySchedule({ alarms, now: at(10) }).every((d) => d.sections.length === 0)).toBe(true);
    expect(groupAlarmsForManage(alarms, 'standard')).toEqual([]);

    // History is untouched.
    expect(history).toEqual([expect.objectContaining({ id: morning.id, status: 'completed', isMainWakeUp: true })]);
    const summary = summarise({ history, ledger: [], unlocked: [], policy: PROGRESSION_POLICY, dayKey: dayKeyAtOffset(-new Date(at(10)).getTimezoneOffset()), now: at(10) });
    expect(summary.morning).toMatchObject({ successful: 1, streak: { current: 1 } });
  });

  it('cancels the future native alarm and any pending snooze rings', async () => {
    const ctx = setup();
    await ctx.alarmStore.load();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ hour: 7, minute: 0, weekdays: [3], isPrimary: true }));
    await ctx.alarmStore.remove(alarm.id);
    expect(ctx.service.cancel).toHaveBeenCalledWith(alarm.id);
    expect(ctx.service.cancelSnoozes).toHaveBeenCalledWith(alarm.id);
  });

  it('a one-off: its one ring is cancelled and it never comes back as the next alarm', async () => {
    const ctx = setup();
    await ctx.alarmStore.load();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ hour: 9, minute: 0, weekdays: [] }));
    expect(buildToday({ alarms: ctx.alarmStore.getState().alarms, occurrences: [], now: at(5) }).next?.alarmId).toBe(alarm.id);
    await ctx.alarmStore.remove(alarm.id);
    expect(ctx.service.cancel).toHaveBeenCalledWith(alarm.id);
    expect(buildToday({ alarms: ctx.alarmStore.getState().alarms, occurrences: [], now: at(5) }).next).toBeNull();
  });

  it('a Gentle morning still waiting: it is closed (kept in history, not deleted) and its reminder cancelled', async () => {
    const ctx = setup();
    await ctx.alarmStore.load();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ hour: 7, minute: 0, weekdays: [3], completionMode: 'gentle', mission }));
    ctx.clock.time = at(7, 2);
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(7), evidence: 'schedule' });
    await ctx.handOff.sync();
    const [morning] = await ctx.occurrences.listRecent();
    expect(ctx.reminders.schedule).toHaveBeenCalled();

    await ctx.alarmStore.remove(alarm.id);
    expect(await ctx.occurrences.get(morning.id)).toMatchObject({ status: 'cancelled' });
    expect(ctx.reminders.cancel).toHaveBeenCalledWith(`gentle-${morning.id}`);
    expect(await ctx.occurrenceRepository.listRecent(10)).toHaveLength(1);
  });

  it('never deletes mornings of other alarms', async () => {
    const ctx = setup();
    await ctx.alarmStore.load();
    const { alarm: keep } = await ctx.alarmStore.save(createAlarmDraft({ hour: 6, minute: 0, weekdays: [3], mission }));
    const { alarm: drop } = await ctx.alarmStore.save(createAlarmDraft({ hour: 6, minute: 30, weekdays: [3], mission }));
    ctx.clock.time = at(6, 35);
    ctx.events.push({ alarmId: keep.id, scheduledAt: at(6), evidence: 'schedule' }, { alarmId: drop.id, scheduledAt: at(6, 30), evidence: 'schedule' });
    await ctx.handOff.sync();
    await ctx.alarmStore.remove(drop.id);
    const history = await ctx.occurrenceRepository.listRecent(10);
    expect(history.find((o) => o.alarmId === keep.id)?.status).toBe('alarm_fired');
    expect(history.find((o) => o.alarmId === drop.id)?.status).toBe('cancelled');
  });
});
