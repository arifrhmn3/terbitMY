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

describe('one-tap "Stop & Open Terbit", modes and Gentle reminders', () => {
  function setupWith(options: { challengeAllowed: boolean }) {
    const clock = { time: at(5, 0) };
    const now = () => clock.time;
    const events: AlarmFiredEvent[] = [];
    const service: AlarmService = {
      ...createNotImplementedAlarmService(),
      schedule: jest.fn(async () => ({ status: 'scheduled' as const })),
      syncAll: jest.fn(async () => {}),
      getFireEvents: jest.fn(async () => events),
    };
    const occurrenceRepository = createMemoryOccurrenceRepository();
    const occurrences = createOccurrenceManager(async () => occurrenceRepository, now);
    const alarmRepository = createMemoryAlarmRepository();
    const alarmStore = createAlarmStore(async () => alarmRepository, service, {
      now,
      effective: (a) => (a.completionMode === 'challenge' && !options.challengeAllowed ? { ...a, completionMode: 'reward' } : a),
    });
    const scheduled = new Map<string, number>();
    const reminders = {
      schedule: jest.fn(async (r: { id: string; fireAt: number }) => {
        scheduled.set(r.id, r.fireAt);
      }),
      cancel: jest.fn(async (id: string) => {
        scheduled.delete(id);
      }),
    };
    const handOff = createAlarmHandOff({ alarmStore, occurrences, service, reminders, now });
    return { clock, events, occurrences, alarmStore, handOff, scheduled };
  }

  const tapped = (alarmId: string, action: 'mission' | 'stop') => ({
    alarmId,
    scheduledAt: at(6, 30),
    firedAt: at(6, 30),
    evidence: 'system' as const,
    stoppedAt: at(6, 31),
    stopAction: action,
  });

  it('routes straight into the configured mission and records Challenge entry', async () => {
    const ctx = setupWith({ challengeAllowed: true });
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'challenge' }));
    ctx.events.push(tapped(alarm.id, 'mission'));
    ctx.clock.time = at(6, 32);

    const morning = await ctx.handOff.sync();
    expect(morning).toMatchObject({
      alarmId: alarm.id,
      status: 'mission_in_progress',
      completionMode: 'challenge',
      alarmStopReason: 'mission',
      fireEvidence: 'system',
    });
  });

  it('records the mode the alarm really rang with when Challenge isn’t allowed', async () => {
    const ctx = setupWith({ challengeAllowed: false });
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'challenge' }));
    ctx.events.push(tapped(alarm.id, 'mission'));
    ctx.clock.time = at(6, 32);
    const morning = await ctx.handOff.sync();
    expect(morning?.completionMode).toBe('reward');
    expect((await ctx.alarmStore.find(alarm.id))?.completionMode).toBe('challenge');
  });

  it('keeps the system Stop as a stop, with the mission still open (Challenge stays incomplete)', async () => {
    const ctx = setupWith({ challengeAllowed: true });
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'challenge' }));
    ctx.events.push(tapped(alarm.id, 'stop'));
    ctx.clock.time = at(6, 35);
    const morning = (await ctx.handOff.sync())!;
    expect(evaluateMorning(morning)).toMatchObject({ alarmOutcome: 'stopped_by_system', missionOutcome: 'not_started', streakEligible: false });
  });

  it('schedules a Gentle reminder after the stop, and cancels it once the mission is done', async () => {
    const ctx = setupWith({ challengeAllowed: false });
    const { alarm } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'gentle', gentleReminderMinutes: 10 }));
    ctx.events.push(tapped(alarm.id, 'stop'));
    ctx.clock.time = at(6, 33);
    const morning = (await ctx.handOff.sync())!;
    expect(ctx.scheduled.get(`gentle-${morning.id}`)).toBe(at(6, 41));

    await ctx.occurrences.startMission(morning.id);
    await ctx.occurrences.completeMission(morning.id, { difficulty: 'easy', questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 1 });
    await ctx.handOff.syncReminders();
    expect(ctx.scheduled.size).toBe(0);
  });

  it('two alarms with different modes produce independently judged mornings', async () => {
    const ctx = setupWith({ challengeAllowed: true });
    const { alarm: weekday } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'challenge', hour: 6 }));
    const { alarm: weekend } = await ctx.alarmStore.save(createAlarmDraft({ completionMode: 'gentle', hour: 8 }));
    ctx.events.push(tapped(weekday.id, 'stop'), { ...tapped(weekend.id, 'stop'), scheduledAt: at(8, 30), stoppedAt: at(8, 31) });
    ctx.clock.time = at(8, 35);
    await ctx.handOff.sync();
    const mornings = await ctx.occurrences.listRecent();
    const byAlarm = Object.fromEntries(mornings.map((o) => [o.alarmId, o]));
    expect(byAlarm[weekday.id].completionMode).toBe('challenge');
    expect(byAlarm[weekend.id].completionMode).toBe('gentle');
    // The 06:30 Challenge morning passed its deadline unfinished; the 08:30 Gentle one is still open.
    expect(evaluateMorning(byAlarm[weekday.id]).summary).toBe('Stopped with phone controls · Challenge incomplete');
    expect(evaluateMorning(byAlarm[weekend.id]).finished).toBe(false);
  });
});
