import type { CompletionMode } from './alarm';
import { isActive, type AlarmOccurrence } from './occurrence';

/**
 * THE COMPLETION WINDOWS: how long a morning's mission can still be finished
 * (and resumed from Today) after its alarm. The one place this is decided;
 * occurrence expiry, Today and the alarm screen all read it.
 *
 * - Reward: up to 2 hours after the alarm was due.
 * - Challenge: 1 hour (the stricter mode keeps its shorter window).
 * - Gentle: until the end of the alarm's local calendar day (not after
 *   midnight). The Gentle follow-up reminder is separate and doesn't set it.
 *
 * Reward and Challenge add the time spent snoozing, so a morning never
 * closes while its snooze rings are still going.
 */
export const MISSION_WINDOW_MS: Record<Exclude<CompletionMode, 'gentle'>, number> = {
  reward: 2 * 60 * 60 * 1000,
  challenge: 60 * 60 * 1000,
};

type Timed = Pick<AlarmOccurrence, 'scheduledAt' | 'snoozeCount' | 'snoozeMinutes' | 'completionMode'>;

/** The last moment (ms) this morning's mission can be finished. */
export function missionCompletionDeadline(occurrence: Timed, mode: CompletionMode = occurrence.completionMode): number {
  if (mode === 'gentle') {
    const due = new Date(occurrence.scheduledAt);
    return new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1).getTime() - 1;
  }
  const snoozing = occurrence.snoozeCount * (occurrence.snoozeMinutes ?? 0) * 60 * 1000;
  return occurrence.scheduledAt + snoozing + MISSION_WINDOW_MS[mode];
}

/** An open morning past its deadline is closed (missed, or dismissed if the phone's Stop was used). */
export function shouldExpire(occurrence: AlarmOccurrence, now: number): boolean {
  return isActive(occurrence) && now > missionCompletionDeadline(occurrence);
}

/**
 * Where a morning's mission stands:
 * - not_rung: the alarm hasn't gone off yet;
 * - resumable: it rang, the mission isn't done and there's still time;
 * - completed: finished (mission done, or an alarm without a mission);
 * - expired: the window closed or the morning ended without the mission;
 * - no_mission: an alarm without a mission that hasn't finished yet.
 */
export type MissionResumeState = 'not_rung' | 'resumable' | 'completed' | 'expired' | 'no_mission';

export function missionResumeState(occurrence: AlarmOccurrence, now: number): MissionResumeState {
  if (occurrence.status === 'completed') return 'completed';
  if (!isActive(occurrence) || now > missionCompletionDeadline(occurrence)) return 'expired';
  if (occurrence.status === 'scheduled') return 'not_rung';
  return occurrence.mission.type === 'none' ? 'no_mission' : 'resumable';
}

/** Tapping it can take the user back into its mission. */
export function canResumeMission(occurrence: AlarmOccurrence, now: number): boolean {
  return missionResumeState(occurrence, now) === 'resumable';
}
