import type { MathMissionResult } from '@/features/missions/math/session';

import type { Alarm, AlarmMission } from './alarm';

/**
 * One time an alarm goes off (or is simulated), kept separate from the
 * alarm's settings so history survives edits and deletes.
 *
 *   scheduled ─► alarm_fired ─► mission_in_progress ─► completed
 *       │            │  └─(no mission)──────────────────► completed
 *       │            └───────────┴──► dismissed | missed
 *       └─► cancelled | dismissed | missed
 *
 * The phone's own Stop control can always end an alarm (it can't and won't
 * be bypassed). So `dismissed` and `missed` are normal outcomes, and only
 * a completed mission counts as a successful morning (see `morningOutcome`).
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

/**
 * `simulated` comes from the developer "Simulate alarm now" button.
 * `native` is reserved for real AlarmKit / AlarmManager alarms (not built yet).
 */
export type OccurrenceSource = 'simulated' | 'native';

export type OccurrenceResult =
  | { kind: 'mission_completed'; mission: MathMissionResult }
  | { kind: 'no_mission' }
  /** Emergency Dismiss inside Terbit MY. */
  | { kind: 'emergency_dismiss' }
  /** Stopped with the phone's own alarm controls (reported by native code; hand-off not built yet). */
  | { kind: 'system_dismiss' };

export type DismissReason = 'emergency' | 'system';

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

/** The alarm went off (real or simulated). `startedAt` records when. */
export function markAlarmFired(occurrence: AlarmOccurrence, now: number): TransitionResult {
  return move(occurrence, ['scheduled'], { status: 'alarm_fired', startedAt: now }, now);
}

/**
 * The user tapped Start Mission. Calling it again while the mission is in
 * progress (for example after the app restarted) changes nothing.
 */
export function startMission(occurrence: AlarmOccurrence, now: number): TransitionResult {
  if (occurrence.mission.type === 'none') return { ok: false, error: 'no-mission' };
  if (occurrence.status === 'mission_in_progress') return { ok: true, occurrence };
  return move(occurrence, ['alarm_fired'], { status: 'mission_in_progress', missionStartedAt: now }, now);
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
  return move(occurrence, ['alarm_fired'], { status: 'completed', endedAt: now, result: { kind: 'no_mission' } }, now);
}

/**
 * The alarm was turned off without finishing the mission: Emergency Dismiss
 * in the app, or the phone's own Stop control.
 */
export function dismissOccurrence(
  occurrence: AlarmOccurrence,
  now: number,
  reason: DismissReason = 'emergency',
): TransitionResult {
  return move(
    occurrence,
    ACTIVE_STATUSES,
    { status: 'dismissed', endedAt: now, result: { kind: reason === 'system' ? 'system_dismiss' : 'emergency_dismiss' } },
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
  alarm_fired: 'Alarm fired',
  mission_in_progress: 'Mission in progress',
  completed: 'Completed',
  dismissed: 'Dismissed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

/**
 * The accountability outcome of a finished occurrence:
 * - `mission_completed`: the mission was finished. The only successful morning.
 * - `completed_without_mission`: the alarm had no mission. Not a successful morning.
 * - `dismissed_without_mission`: stopped (in the app or by the phone) before the mission started.
 * - `mission_abandoned`: the mission started but was never finished (dismissed or timed out).
 * - `missed`: nobody responded to the alarm.
 * - `cancelled`: the alarm was deleted. Doesn't count either way.
 * - `in_progress`: still active.
 */
export type MorningOutcome =
  | 'mission_completed'
  | 'completed_without_mission'
  | 'dismissed_without_mission'
  | 'mission_abandoned'
  | 'missed'
  | 'cancelled'
  | 'in_progress';

export function morningOutcome(o: AlarmOccurrence): MorningOutcome {
  switch (o.status) {
    case 'completed':
      return o.result?.kind === 'mission_completed' ? 'mission_completed' : 'completed_without_mission';
    case 'dismissed':
      return o.missionStartedAt !== null ? 'mission_abandoned' : 'dismissed_without_mission';
    case 'missed':
      return o.missionStartedAt !== null ? 'mission_abandoned' : 'missed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'in_progress';
  }
}

/** Only a completed mission counts toward streaks and XP (Phase 2). */
export function isSuccessfulMorning(o: AlarmOccurrence): boolean {
  return morningOutcome(o) === 'mission_completed';
}

export const OUTCOME_LABEL: Record<MorningOutcome, string> = {
  mission_completed: 'Completed',
  completed_without_mission: 'Turned off (no mission)',
  dismissed_without_mission: 'Dismissed, no mission',
  mission_abandoned: 'Mission abandoned',
  missed: 'Missed',
  cancelled: 'Cancelled',
  in_progress: 'In progress',
};
