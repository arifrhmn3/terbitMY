import type { MathMissionResult } from '@/features/missions/math/session';

import type { Alarm, AlarmMission, CompletionMode } from './alarm';

/**
 * One time an alarm goes off (or is simulated), kept separate from the
 * alarm's settings so history survives edits and deletes.
 *
 *   scheduled ─► alarm_fired ─► mission_in_progress ─► completed
 *       │            │  └─(no mission)──────────────────► completed
 *       │            └───────────┴──► dismissed | missed
 *       └─► cancelled | dismissed | missed
 *
 * The phone's own Stop control can always end the alarm sound (it can't and
 * won't be bypassed). Stopping the *alarm* is recorded separately
 * (`alarmStoppedAt`) and doesn't end the *morning*: in every mode the mission
 * can still be completed afterwards, until the completion deadline. How the
 * morning is judged lives in `accountability.ts`.
 */
export type OccurrenceStatus =
  | 'scheduled'
  | 'alarm_fired'
  | 'mission_in_progress'
  | 'completed'
  | 'dismissed'
  | 'missed'
  | 'cancelled';

export const ACTIVE_STATUSES: readonly OccurrenceStatus[] = ['scheduled', 'alarm_fired', 'mission_in_progress'];

/** `simulated`: the developer "Simulate alarm now" button. `native`: a real AlarmKit / AlarmManager alarm. */
export type OccurrenceSource = 'simulated' | 'native';

/**
 * How Terbit MY knows the alarm went off:
 * - `app`: simulated inside Terbit MY.
 * - `system`: the operating system ran Terbit MY's code when it fired (Android).
 * - `schedule`: the AlarmKit alarm's time passed (iOS doesn't tell apps when an alarm fires).
 */
export type FireEvidence = 'app' | 'system' | 'schedule';

/** Why the alarm sound ended. */
export type AlarmStopReason = 'system' | 'mission' | 'dismiss' | 'turn_off';

export type OccurrenceResult =
  | { kind: 'mission_completed'; mission: MathMissionResult }
  | { kind: 'no_mission' }
  /** Given up inside Terbit MY (Emergency Dismiss / skip mission). */
  | { kind: 'emergency_dismiss' }
  /** Stopped with the phone's own controls and the mission was never completed. */
  | { kind: 'system_dismiss' };

export type DismissReason = 'emergency' | 'system';

export type AlarmOccurrence = {
  id: string;
  alarmId: string;
  /** When the alarm was due to ring, in ms since 1970. With `alarmId` this identifies the event. */
  scheduledAt: number;
  source: OccurrenceSource;
  fireEvidence: FireEvidence;
  status: OccurrenceStatus;
  /** Copied from the alarm when the occurrence is created. */
  alarmLabel: string;
  mission: AlarmMission;
  snoozeMinutes: number | null;
  completionMode: CompletionMode;
  gentleReminderMinutes: number;
  /** When the alarm went off. */
  startedAt: number | null;
  /** When the alarm sound ended, and why. */
  alarmStoppedAt: number | null;
  alarmStopReason: AlarmStopReason | null;
  missionStartedAt: number | null;
  missionCompletedAt: number | null;
  /** When it reached a final status. */
  endedAt: number | null;
  result: OccurrenceResult | null;
  createdAt: number;
  updatedAt: number;
};

/** Active occurrences are closed this long after the alarm was due (Gentle mode allows longer). */
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
  fireEvidence?: FireEvidence;
  id?: string;
}): AlarmOccurrence {
  const { alarm, scheduledAt, source, now } = params;
  return {
    id: params.id ?? createOccurrenceId(),
    alarmId: alarm.id,
    scheduledAt,
    source,
    fireEvidence: params.fireEvidence ?? (source === 'simulated' ? 'app' : 'system'),
    status: 'scheduled',
    alarmLabel: alarm.label,
    mission: alarm.mission,
    snoozeMinutes: alarm.snooze.enabled ? alarm.snooze.minutes : null,
    completionMode: alarm.completionMode,
    gentleReminderMinutes: alarm.gentleReminderMinutes,
    startedAt: null,
    alarmStoppedAt: null,
    alarmStopReason: null,
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
  changes: Partial<AlarmOccurrence>,
  now: number,
): TransitionResult {
  if (!isActive(occurrence)) return { ok: false, error: 'already-finished' };
  if (!from.includes(occurrence.status)) return { ok: false, error: 'invalid-transition' };
  return { ok: true, occurrence: { ...occurrence, ...changes, updatedAt: now } };
}

/** Records the first reason the alarm sound ended; later reasons don't overwrite it. */
function stopFields(occurrence: AlarmOccurrence, reason: AlarmStopReason, at: number): Partial<AlarmOccurrence> {
  return occurrence.alarmStoppedAt !== null ? {} : { alarmStoppedAt: at, alarmStopReason: reason };
}

/** The alarm went off (real or simulated). `firedAt` defaults to now. */
export function markAlarmFired(occurrence: AlarmOccurrence, now: number, firedAt = now): TransitionResult {
  return move(occurrence, ['scheduled'], { status: 'alarm_fired', startedAt: firedAt }, now);
}

/**
 * The phone's own Stop control ended the alarm. The morning stays open so the
 * mission can still be completed, except for alarms without a mission, which
 * are simply done.
 */
export function recordSystemStop(occurrence: AlarmOccurrence, now: number, stoppedAt = now): TransitionResult {
  if (occurrence.mission.type === 'none') {
    return move(
      occurrence,
      ['alarm_fired'],
      { ...stopFields(occurrence, 'system', stoppedAt), status: 'completed', endedAt: now, result: { kind: 'no_mission' } },
      now,
    );
  }
  if (occurrence.alarmStoppedAt !== null && isActive(occurrence)) return { ok: true, occurrence };
  return move(occurrence, ['alarm_fired', 'mission_in_progress'], stopFields(occurrence, 'system', stoppedAt), now);
}

/**
 * The user tapped Start Mission. Calling it again while the mission is in
 * progress (for example after the app restarted) changes nothing.
 */
export function startMission(occurrence: AlarmOccurrence, now: number): TransitionResult {
  if (occurrence.mission.type === 'none') return { ok: false, error: 'no-mission' };
  if (occurrence.status === 'mission_in_progress') return { ok: true, occurrence };
  return move(
    occurrence,
    ['alarm_fired'],
    { ...stopFields(occurrence, 'mission', now), status: 'mission_in_progress', missionStartedAt: now },
    now,
  );
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

/** For alarms with no mission: the user turned the alarm off in Terbit MY. */
export function completeWithoutMission(occurrence: AlarmOccurrence, now: number): TransitionResult {
  if (occurrence.mission.type !== 'none') {
    return isActive(occurrence) ? { ok: false, error: 'mission-required' } : { ok: false, error: 'already-finished' };
  }
  return move(
    occurrence,
    ['alarm_fired'],
    { ...stopFields(occurrence, 'turn_off', now), status: 'completed', endedAt: now, result: { kind: 'no_mission' } },
    now,
  );
}

/**
 * Ends the morning without the mission. `emergency`: given up in Terbit MY.
 * `system`: the alarm was stopped with the phone's controls and the mission
 * was never completed (used when the completion deadline passes).
 */
export function dismissOccurrence(
  occurrence: AlarmOccurrence,
  now: number,
  reason: DismissReason = 'emergency',
): TransitionResult {
  return move(
    occurrence,
    ACTIVE_STATUSES,
    {
      ...stopFields(occurrence, reason === 'system' ? 'system' : 'dismiss', now),
      status: 'dismissed',
      endedAt: now,
      result: { kind: reason === 'system' ? 'system_dismiss' : 'emergency_dismiss' },
    },
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

/** Gentle mode: when the follow-up reminder is due, counted from when the alarm stopped (or went off). */
export function followUpAt(occurrence: AlarmOccurrence): number {
  const from = occurrence.alarmStoppedAt ?? occurrence.startedAt ?? occurrence.scheduledAt;
  return from + occurrence.gentleReminderMinutes * 60 * 1000;
}

/** After this, an unfinished morning is closed. Gentle mode leaves an hour after the follow-up. */
export function completionDeadline(occurrence: AlarmOccurrence): number {
  const base = occurrence.scheduledAt + MISSED_AFTER_MS;
  return occurrence.completionMode === 'gentle' ? Math.max(base, followUpAt(occurrence) + MISSED_AFTER_MS) : base;
}

export function shouldExpire(occurrence: AlarmOccurrence, now: number): boolean {
  return isActive(occurrence) && now > completionDeadline(occurrence);
}

/**
 * Closes a morning whose deadline passed: `dismissed` (system) if the phone's
 * Stop was used and the mission never finished, otherwise `missed`.
 */
export function expireOccurrence(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return occurrence.alarmStopReason === 'system'
    ? dismissOccurrence(occurrence, now, 'system')
    : markMissed(occurrence, now);
}

export const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  scheduled: 'Scheduled',
  alarm_fired: 'Alarm fired',
  mission_in_progress: 'Mission in progress',
  completed: 'Completed',
  dismissed: 'Dismissed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};
