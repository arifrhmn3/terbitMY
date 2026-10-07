import type { MathMissionResult } from '@/features/missions/math/session';

import type { Alarm } from './alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  createOccurrence,
  dismissOccurrence,
  markMissed,
  shouldMarkMissed,
  startMission,
  markAlarmFired,
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
 * change is saved with a status check, so an occurrence can only finish once.
 */
export function createOccurrenceManager(
  getRepository: () => Promise<OccurrenceRepository>,
  now: () => number = Date.now,
) {
  async function apply(id: string, transition: (o: AlarmOccurrence, at: number) => TransitionResult) {
    const repository = await getRepository();
    const current = await repository.get(id);
    if (!current) throw new OccurrenceError('not-found');

    const result = transition(current, now());
    if (!result.ok) throw new OccurrenceError(result.error);
    if (result.occurrence === current) return current; // nothing changed

    const saved = await repository.update(result.occurrence, current.status);
    if (!saved) throw new OccurrenceError('conflict');
    return result.occurrence;
  }

  /** Records active occurrences that were left too long (app closed, phone off) as missed. */
  async function expireStale() {
    const repository = await getRepository();
    const at = now();
    for (const occurrence of await repository.listActive()) {
      if (!shouldMarkMissed(occurrence, at)) continue;
      const result = markMissed(occurrence, at);
      if (result.ok) await repository.update(result.occurrence, occurrence.status);
    }
  }

  /**
   * The alarm is ringing: create the occurrence and mark it started. If this
   * alarm already has an active occurrence, that one is returned instead, so
   * the same alarm can never have two running at once.
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
    const started = markAlarmFired(createOccurrence({ alarm, ...options, now: at }), at);
    if (!started.ok) throw new OccurrenceError(started.error);
    try {
      await repository.insert(started.occurrence);
    } catch (error) {
      if (error instanceof DuplicateOccurrenceError) throw new OccurrenceError('conflict');
      throw error;
    }
    return started.occurrence;
  }

  async function cancelForAlarm(alarmId: string) {
    const repository = await getRepository();
    for (const occurrence of await repository.listActive()) {
      if (occurrence.alarmId !== alarmId) continue;
      const result = cancelOccurrence(occurrence, now());
      if (result.ok) await repository.update(result.occurrence, occurrence.status);
    }
  }

  return {
    async get(id: string) {
      return (await getRepository()).get(id);
    },
    trigger,
    startMission: (id: string) => apply(id, startMission),
    completeMission: (id: string, result: MathMissionResult) =>
      apply(id, (o, at) => completeMission(o, result, at)),
    completeWithoutMission: (id: string) => apply(id, completeWithoutMission),
    /** `reason: 'system'` is for when native code reports the phone's own Stop control was used. */
    dismiss: (id: string, reason: DismissReason = 'emergency') =>
      apply(id, (o, at) => dismissOccurrence(o, at, reason)),
    cancelForAlarm,
    expireStale,
    /** Newest first, after recording any missed ones. */
    async listRecent(limit = 30) {
      await expireStale();
      return (await getRepository()).listRecent(limit);
    },
  };
}

export type OccurrenceManager = ReturnType<typeof createOccurrenceManager>;
