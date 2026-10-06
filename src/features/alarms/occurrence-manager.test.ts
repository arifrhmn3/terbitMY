import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type Alarm } from './alarm';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore } from './alarm-store';
import { MISSED_AFTER_MS } from './occurrence';
import { createOccurrenceManager, OccurrenceError } from './occurrence-manager';
import { createMemoryOccurrenceRepository } from './occurrence-repository';
import { currentQuestion, startMathSession, submitMathAnswer } from '@/features/missions/math/session';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';

const alarm: Alarm = {
  ...createAlarmDraft({ label: 'Subuh', mission: { type: 'math', difficulty: 'easy', questionCount: 3 } }),
  id: 'alarm-1',
  createdAt: 0,
  updatedAt: 0,
};

function setup() {
  const repository = createMemoryOccurrenceRepository();
  const clock = { time: 10_000 };
  const manager = createOccurrenceManager(async () => repository, () => clock.time);
  return { repository, clock, manager };
}

/** Plays a real maths mission: one wrong answer, then every answer right. */
function playMathMission() {
  let session = startMathSession({ difficulty: 'easy', questionCount: 3 }, 123, 0);
  session = submitMathAnswer(session, String(currentQuestion(session)!.answer + 1), 1_000);
  while (!session.result) {
    session = submitMathAnswer(session, String(currentQuestion(session)!.answer), 25_000);
  }
  return session.result;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(OccurrenceError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('occurrence manager', () => {
  it('trigger creates a started, simulated occurrence', async () => {
    const { manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    expect(occurrence).toMatchObject({
      alarmId: 'alarm-1',
      status: 'started',
      source: 'simulated',
      startedAt: 10_000,
      alarmLabel: 'Subuh',
    });
  });

  it('resumes the active occurrence instead of creating a second one', async () => {
    const { manager, clock } = setup();
    const first = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    clock.time = 20_000;
    const second = await manager.trigger(alarm, { scheduledAt: 20_000, source: 'simulated' });
    expect(second.id).toBe(first.id);
    expect(await manager.listRecent()).toHaveLength(1);
  });

  it('refuses to re-run an alarm event that already finished', async () => {
    const { manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'native' });
    await manager.dismiss(occurrence.id);
    await expectCode(manager.trigger(alarm, { scheduledAt: 10_000, source: 'native' }), 'already-finished');
  });

  it('records a completed maths mission with attempts and duration', async () => {
    const { manager, clock } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    clock.time = 12_000;
    await manager.startMission(occurrence.id);

    const result = playMathMission();
    clock.time = 40_000;
    const done = await manager.completeMission(occurrence.id, result);

    expect(result).toMatchObject({ questionCount: 3, attempts: 4, wrongAttempts: 1, durationMs: 25_000 });
    expect(done).toMatchObject({
      status: 'completed',
      startedAt: 10_000,
      missionStartedAt: 12_000,
      missionCompletedAt: 40_000,
      result: { kind: 'mission_completed', mission: result },
    });
  });

  it('prevents duplicate completion of the same occurrence', async () => {
    const { manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    await manager.startMission(occurrence.id);
    const result = playMathMission();
    await manager.completeMission(occurrence.id, result);

    await expectCode(manager.completeMission(occurrence.id, result), 'already-finished');
    await expectCode(manager.dismiss(occurrence.id), 'already-finished');
    const history = await manager.listRecent();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('completed');
  });

  it('only lets one of two racing completions win', async () => {
    const { manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    await manager.startMission(occurrence.id);
    const result = playMathMission();

    const outcomes = await Promise.allSettled([
      manager.completeMission(occurrence.id, result),
      manager.completeMission(occurrence.id, result),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  });

  it('records an emergency dismiss as dismissed, not completed', async () => {
    const { manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    await manager.startMission(occurrence.id);
    const dismissed = await manager.dismiss(occurrence.id);
    expect(dismissed).toMatchObject({ status: 'dismissed', result: { kind: 'emergency_dismiss' } });
    expect(dismissed.missionCompletedAt).toBeNull();
  });

  it('marks abandoned occurrences as missed', async () => {
    const { manager, clock } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    clock.time = 10_001 + MISSED_AFTER_MS;
    const [history] = await manager.listRecent();
    expect(history).toMatchObject({ id: occurrence.id, status: 'missed' });

    // A new trigger after that starts a fresh occurrence.
    const next = await manager.trigger(alarm, { scheduledAt: clock.time, source: 'simulated' });
    expect(next.id).not.toBe(occurrence.id);
  });

  it('cancels the active occurrence when its alarm is deleted', async () => {
    const { manager } = setup();
    const alarms = createAlarmStore(async () => createMemoryAlarmRepository(), createNotImplementedAlarmService(), {
      onRemove: manager.cancelForAlarm,
    });
    await alarms.load();
    const { alarm: saved } = await alarms.save(createAlarmDraft());
    const occurrence = await manager.trigger(saved, { scheduledAt: 10_000, source: 'simulated' });

    await alarms.remove(saved.id);
    expect((await manager.get(occurrence.id))?.status).toBe('cancelled');
  });

  it('keeps history in the repository across manager instances', async () => {
    const { repository, manager } = setup();
    const occurrence = await manager.trigger(alarm, { scheduledAt: 10_000, source: 'simulated' });
    await manager.dismiss(occurrence.id);

    const reopened = createOccurrenceManager(async () => repository, () => 20_000);
    const history = await reopened.listRecent();
    expect(history.map((o) => [o.id, o.status])).toEqual([[occurrence.id, 'dismissed']]);
  });

  it('reports unknown occurrences', async () => {
    const { manager } = setup();
    await expectCode(manager.startMission('nope'), 'not-found');
  });
});
