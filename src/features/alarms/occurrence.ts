import type { MathMissionResult } from '@/features/missions/math/session';

import type { Alarm, AlarmMission } from './alarm';

/**
 * One time an alarm goes off (or is simulated), kept separate from the
 * alarm's settings so history survives edits and deletes.
 *
 *   scheduled ─► started ─► mission_in_progress ─► completed
 *       │           │  └─(no mission)───────────────► completed
 *       │           └──────────┴──► dismissed | missed
 *       └─► cancelled | dismissed | missed
 */
export type OccurrenceStatus =
  | 'scheduled'
  | 'started'
  | 'mission_in_progress'
  | 'completed'
  | 'dismissed'
  | 'missed'
  | 'cancelled';

export const ACTIVE_STATUSES: readonly OccurrenceStatus[] = ['scheduled', 'started', 'mission_in_progress'];

/**
 * `simulated` comes from the developer "Simulate alarm now" button.
 * `native` is reserved for real AlarmKit / AlarmManager alarms (not built yet).
 */
export type OccurrenceSource = 'simulated' | 'native';

export type OccurrenceResult =
  | { kind: 'mission_completed'; mission: MathMissionResult }
  | { kind: 'no_mission' }
  | { kind: 'emergency_dismiss' };

export type AlarmOccurrence = {
  id: string;
  alarmId: string;
  /** When the alarm was due to ring, in ms since 1970. With `alarmId` this identifies the event. */
  scheduledAt: number;
  source: OccurrenceSource;
  status: OccurrenceStatus;
  /** Copied from the alarm when the occurrence is created. */
  alarmLabel: string;
  mission: AlarmMission;
  snoozeMinutes: number | null;
  /** When the ringing screen was shown. */
  startedAt: number | null;
  missionStartedAt: number | null;
  missionCompletedAt: number | null;
  /** When it reached a final status. */
  endedAt: number | null;
  result: OccurrenceResult | null;
  createdAt: number;
  updatedAt: number;
};

/** Active occurrences older than this are recorded as missed. */
export const MISSED_AFTER_MS = 60 * 60 * 1000;

export type TransitionError = 'already-finished' | 'invalid-transition' | 'mission-required' | 'no-mission';

export type TransitionResult = { ok: true; occurrence: AlarmOccurrence } | { ok: false; error: TransitionError };

export function isActive(occurrence: Pick<AlarmOccurrence, 'status'>): boolean {
  return ACTIVE_STATUSES.includes(occurrence.status);
}

export function createOccurrenceId(): string {
  return `occ_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createOccurrence(params: {
  alarm: Alarm;
  scheduledAt: number;
  source: OccurrenceSource;
  now: number;
  id?: string;
}): AlarmOccurrence {
  const { alarm, scheduledAt, source, now } = params;
  return {
    id: params.id ?? createOccurrenceId(),
    alarmId: alarm.id,
    scheduledAt,
    source,
    status: 'scheduled',
    alarmLabel: alarm.label,
    mission: alarm.mission,
    snoozeMinutes: alarm.snooze.enabled ? alarm.snooze.minutes : null,
    startedAt: null,
    missionStartedAt: null,
    missionCompletedAt: null,
    endedAt: null,
    result: null,
    createdAt: now,
    updatedAt: now,
  };
}

function move(
  occurrence: AlarmOccurrence,
  from: readonly OccurrenceStatus[],
  changes: Partial<AlarmOccurrence> & { status: OccurrenceStatus },
  now: number,
): TransitionResult {
  if (!isActive(occurrence)) return { ok: false, error: 'already-finished' };
  if (!from.includes(occurrence.status)) return { ok: false, error: 'invalid-transition' };
  return { ok: true, occurrence: { ...occurrence, ...changes, updatedAt: now } };
}

/** The ringing screen is showing. */
export function startOccurrence(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return move(occurrence, ['scheduled'], { status: 'started', startedAt: now }, now);
}

/**
 * The user tapped Start Mission. Calling it again while the mission is in
 * progress (for example after the app restarted) changes nothing.
 */
export function startMission(occurrence: AlarmOccurrence, now: number): TransitionResult {
  if (occurrence.mission.type === 'none') return { ok: false, error: 'no-mission' };
  if (occurrence.status === 'mission_in_progress') return { ok: true, occurrence };
  return move(occurrence, ['started'], { status: 'mission_in_progress', missionStartedAt: now }, now);
}

export function completeMission(
  occurrence: AlarmOccurrence,
  mission: MathMissionResult,
  now: number,
): TransitionResult {
  return move(
    occurrence,
    ['mission_in_progress'],
    {
      status: 'completed',
      missionCompletedAt: now,
      endedAt: now,
      result: { kind: 'mission_completed', mission },
    },
    now,
  );
}

/** For alarms with no mission: the user turned the alarm off. */
export function completeWithoutMission(occurrence: AlarmOccurrence, now: number): TransitionResult {
  if (occurrence.mission.type !== 'none') {
    return isActive(occurrence) ? { ok: false, error: 'mission-required' } : { ok: false, error: 'already-finished' };
  }
  return move(occurrence, ['started'], { status: 'completed', endedAt: now, result: { kind: 'no_mission' } }, now);
}

/** Emergency Dismiss: the alarm was turned off without finishing the mission. */
export function dismissOccurrence(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return move(
    occurrence,
    ACTIVE_STATUSES,
    { status: 'dismissed', endedAt: now, result: { kind: 'emergency_dismiss' } },
    now,
  );
}

export function markMissed(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return move(occurrence, ACTIVE_STATUSES, { status: 'missed', endedAt: now }, now);
}

/** The alarm was deleted (or rescheduled) before this occurrence finished. */
export function cancelOccurrence(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return move(occurrence, ACTIVE_STATUSES, { status: 'cancelled', endedAt: now }, now);
}

export function shouldMarkMissed(occurrence: AlarmOccurrence, now: number): boolean {
  return isActive(occurrence) && now - occurrence.scheduledAt > MISSED_AFTER_MS;
}

export const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  scheduled: 'Scheduled',
  started: 'Ringing',
  mission_in_progress: 'Mission in progress',
  completed: 'Completed',
  dismissed: 'Dismissed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};
