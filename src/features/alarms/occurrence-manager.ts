import type { MathMissionResult } from '@/features/missions/math/session';
import type { AlarmFiredEvent } from '@/services/alarm-scheduler';

import type { Alarm } from './alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  createOccurrence,
  dismissOccurrence,
  expireOccurrence,
  isActive,
  markAlarmFired,
  recordSystemStop,
  shouldExpire,
  startMission,
  type AlarmOccurrence,
  type DismissReason,
  type OccurrenceSource,
  type TransitionError,
  type TransitionResult,
} from './occurrence';
import { DuplicateOccurrenceError, type OccurrenceRepository } from './occurrence-repository';

export type OccurrenceErrorCode = TransitionError | 'not-found' | 'conflict';

export class OccurrenceError extends Error {
  constructor(readonly code: OccurrenceErrorCode) {
    super(`Alarm occurrence error: ${code}`);
    this.name = 'OccurrenceError';
  }
}

/**
 * Runs the alarm → ringing → mission → result flow and records it. Each
 * change is saved with a status (and last-update) check, so an occurrence
 * can only finish once.
 */
export function createOccurrenceManager(
  getRepository: () => Promise<OccurrenceRepository>,
  now: () => number = Date.now,
) {
  async function save(repository: OccurrenceRepository, next: AlarmOccurrence, previous: AlarmOccurrence) {
    return repository.update(next, previous.status, previous.updatedAt);
  }

  async function apply(id: string, transition: (o: AlarmOccurrence, at: number) => TransitionResult) {
    const repository = await getRepository();
    const current = await repository.get(id);
    if (!current) throw new OccurrenceError('not-found');

    const result = transition(current, now());
    if (!result.ok) throw new OccurrenceError(result.error);
    if (result.occurrence === current) return current; // nothing changed

    if (!(await save(repository, result.occurrence, current))) throw new OccurrenceError('conflict');
    return result.occurrence;
  }

  /** Closes active occurrences past their completion deadline (dismissed if stopped by the phone, else missed). */
  async function expireStale() {
    const repository = await getRepository();
    const at = now();
    for (const occurrence of await repository.listActive()) {
      if (!shouldExpire(occurrence, at)) continue;
      const result = expireOccurrence(occurrence, at);
      if (result.ok) await save(repository, result.occurrence, occurrence);
    }
  }

  async function insertFired(repository: OccurrenceRepository, fired: TransitionResult) {
    if (!fired.ok) throw new OccurrenceError(fired.error);
    try {
      await repository.insert(fired.occurrence);
    } catch (error) {
      if (error instanceof DuplicateOccurrenceError) throw new OccurrenceError('conflict');
      throw error;
    }
    return fired.occurrence;
  }

  /**
   * SIMULATION: the developer "Simulate alarm now" button. If this alarm
   * already has an active occurrence, that one is returned instead, so the
   * same alarm can never have two running at once.
   */
  async function trigger(
    alarm: Alarm,
    options: { scheduledAt: number; source: OccurrenceSource },
  ): Promise<AlarmOccurrence> {
    await expireStale();
    const repository = await getRepository();

    const active = (await repository.listActive()).find((o) => o.alarmId === alarm.id);
    if (active) {
      return active.status === 'scheduled' ? apply(active.id, markAlarmFired) : active;
    }
    if (await repository.findByEvent(alarm.id, options.scheduledAt)) {
      throw new OccurrenceError('already-finished');
    }

    const at = now();
    return insertFired(repository, markAlarmFired(createOccurrence({ alarm, ...options, now: at }), at));
  }

  /**
   * A genuine native alarm went off. Safe to call repeatedly for the same
   * event (it finds the existing occurrence). An older unfinished morning for
   * the same alarm is closed first. Records a stop with the phone's controls
   * when native code reports one.
   */
  async function recordNativeFire(alarm: Alarm, event: AlarmFiredEvent): Promise<AlarmOccurrence> {
    await expireStale();
    const repository = await getRepository();

    let occurrence = await repository.findByEvent(alarm.id, event.scheduledAt);
    if (!occurrence) {
      for (const older of (await repository.listActive()).filter((o) => o.alarmId === alarm.id)) {
        const closed = expireOccurrence(older, now());
        if (closed.ok) await save(repository, closed.occurrence, older);
      }
      const at = now();
      const created = createOccurrence({
        alarm,
        scheduledAt: event.scheduledAt,
        source: 'native',
        fireEvidence: event.evidence ?? 'system',
        now: at,
      });
      try {
        occurrence = await insertFired(repository, markAlarmFired(created, at, event.firedAt ?? event.scheduledAt));
      } catch (error) {
        // Another call recorded the same event at the same moment.
        const existing = await repository.findByEvent(alarm.id, event.scheduledAt);
        if (!existing) throw error;
        occurrence = existing;
      }
    }

    if (event.stopAction === 'stop' && event.stoppedAt != null && isActive(occurrence) && occurrence.alarmStoppedAt === null) {
      const stoppedAt = event.stoppedAt;
      occurrence = await apply(occurrence.id, (o, at) => recordSystemStop(o, at, stoppedAt));
    }
    if (shouldExpire(occurrence, now())) {
      occurrence = await apply(occurrence.id, expireOccurrence);
    }
    return occurrence;
  }

  async function cancelForAlarm(alarmId: string) {
    const repository = await getRepository();
    for (const occurrence of await repository.listActive()) {
      if (occurrence.alarmId !== alarmId) continue;
      const result = cancelOccurrence(occurrence, now());
      if (result.ok) await save(repository, result.occurrence, occurrence);
    }
  }

  return {
    async get(id: string) {
      return (await getRepository()).get(id);
    },
    async findForEvent(alarmId: string, scheduledAt: number) {
      return (await getRepository()).findByEvent(alarmId, scheduledAt);
    },
    async listActive() {
      await expireStale();
      return (await getRepository()).listActive();
    },
    trigger,
    recordNativeFire,
    /** The phone's own Stop control ended the alarm; the mission can still be completed. */
    recordSystemStop: (id: string) => apply(id, recordSystemStop),
    startMission: (id: string) => apply(id, startMission),
    completeMission: (id: string, result: MathMissionResult) =>
      apply(id, (o, at) => completeMission(o, result, at)),
    completeWithoutMission: (id: string) => apply(id, completeWithoutMission),
    /** Gives up on the morning without the mission (Emergency Dismiss / skip). */
    dismiss: (id: string, reason: DismissReason = 'emergency') =>
      apply(id, (o, at) => dismissOccurrence(o, at, reason)),
    cancelForAlarm,
    expireStale,
    /** Newest first, after closing any past their deadline. */
    async listRecent(limit = 30) {
      await expireStale();
      return (await getRepository()).listRecent(limit);
    },
  };
}

export type OccurrenceManager = ReturnType<typeof createOccurrenceManager>;
