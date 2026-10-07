import { describe, expect, it, jest } from '@jest/globals';

import { evaluateMorning } from './accountability';
import { createAlarmDraft } from './alarm';
import { createAlarmHandOff, shouldPresent } from './alarm-handoff';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore } from './alarm-store';
import { createOccurrenceManager } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmFiredEvent, AlarmService } from '@/services/alarm-scheduler';

const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m).getTime(); // Wednesday

function setup(events: AlarmFiredEvent[] = []) {
  const clock = { time: at(5, 0) };
  const now = () => clock.time;
  const base = createNotImplementedAlarmService();
  const service: AlarmService = {
    ...base,
    schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
    syncAll: jest.fn(async () => {}),
    getFireEvents: jest.fn(async () => events),
  };
  const occurrences = createOccurrenceManager(async () => occurrenceRepository, now);
  const occurrenceRepository = createMemoryOccurrenceRepository();
  const alarmStore = createAlarmStore(async () => alarmRepository, service, { now, onRemove: occurrences.cancelForAlarm });
  const alarmRepository = createMemoryAlarmRepository();
  const handOff = createAlarmHandOff({ alarmStore, occurrences, service, now });
  return { clock, service, occurrences, alarmStore, handOff, events };
}

describe('saved alarm → genuine native alarm → mission', () => {
  it('records the fired alarm and returns it as the morning to present', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'challenge' }));
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), firedAt: at(6, 30), evidence: 'system' });
    ctx.clock.time = at(6, 35);

    const morning = await ctx.handOff.sync();
    expect(morning).toMatchObject({ alarmId: alarm.id, status: 'alarm_fired', completionMode: 'challenge', source: 'native' });
    expect(ctx.service.syncAll).toHaveBeenCalled();

    // The configured mission runs against that occurrence.
    await ctx.occurrences.startMission(morning!.id);
    const done = await ctx.occurrences.completeMission(morning!.id, {
      difficulty: 'easy',
      questionCount: 3,
      attempts: 3,
      wrongAttempts: 0,
      accuracy: 1,
      durationMs: 30_000,
    });
    expect(evaluateMorning(done)).toMatchObject({ summary: 'Mission completed', rewardEligible: true, streakEligible: true });
    expect(await ctx.handOff.sync()).toBeNull();
  });

  it('records a phone Stop before the mission accurately', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft());
    ctx.events.push({
      alarmId: alarm.id,
      scheduledAt: at(6, 30),
      firedAt: at(6, 30),
      evidence: 'system',
      stoppedAt: at(6, 31),
      stopAction: 'stop',
    });
    ctx.clock.time = at(6, 40);
    const morning = await ctx.handOff.sync();
    expect(evaluateMorning(morning!)).toMatchObject({
      alarmOutcome: 'stopped_by_system',
      missionOutcome: 'not_started',
      rewardEligible: false,
    });
  });

  it('turns off a one-off alarm after it rang, and ignores deleted alarms', async () => {
    const ctx = setup();
    const { alarm: once } = await ctx.alarmStore.save(createAlarmDraft({ weekdays: [] }));
    ctx.events.push(
      { alarmId: once.id, scheduledAt: at(6, 30), evidence: 'schedule' },
      { alarmId: 'deleted-alarm', scheduledAt: at(6, 30), evidence: 'schedule' },
    );
    ctx.clock.time = at(6, 45);
    await ctx.handOff.sync();
    expect((await ctx.alarmStore.find(once.id))?.enabled).toBe(false);
    expect((await ctx.occurrences.listActive()).map((o) => o.alarmId)).toEqual([once.id]);
  });

  it('shares one run between concurrent callers', async () => {
    const ctx = setup();
    await Promise.all([ctx.handOff.sync(), ctx.handOff.sync()]);
    expect(ctx.service.getFireEvents).toHaveBeenCalledTimes(1);
  });
});

describe('when to present the alarm screen', () => {
  it('presents once per session, and again for Gentle mode once the follow-up is due', async () => {
    const ctx = setup();
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'gentle', gentleReminderMinutes: 10 }));
    ctx.events.push({ alarmId: alarm.id, scheduledAt: at(6, 30), evidence: 'system', stoppedAt: at(6, 31), stopAction: 'stop' });
    ctx.clock.time = at(6, 32);
    const morning = (await ctx.handOff.sync())!;

    expect(shouldPresent(morning, at(6, 32), undefined)).toBe(true);
    expect(shouldPresent(morning, at(6, 35), at(6, 32))).toBe(false);
    // Follow-up due 10 minutes after the 06:31 stop.
    expect(shouldPresent(morning, at(6, 41), at(6, 32))).toBe(true);
    expect(shouldPresent(morning, at(6, 50), at(6, 42))).toBe(false);

    const reward = { ...morning, completionMode: 'reward' as const };
    expect(shouldPresent(reward, at(6, 50), at(6, 32))).toBe(false);
  });
});
