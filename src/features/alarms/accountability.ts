import type { CompletionMode } from './alarm';
import { followUpAt, isActive, type AlarmOccurrence } from './occurrence';

/**
 * How a morning is judged. Four separate ideas, kept apart on purpose:
 * - alarm outcome: what happened to the alarm itself;
 * - mission outcome: what happened to the mission;
 * - accountability mode: the alarm's beta setting (Reward / Challenge / Gentle);
 * - eligibility: whether the morning would earn rewards (XP) or a streak day.
 *
 * Eligibility comes from `MODE_POLICIES`, so beta behaviour can change here
 * without changing stored data. The phone's Stop control is never blocked in
 * any mode; stopping the alarm is just an alarm outcome.
 */

export type AlarmOutcome =
  | 'pending' // not gone off yet
  | 'ringing' // went off and no stop has been recorded yet (Android / simulated)
  | 'fired' // went off; iOS doesn't report when or how it was stopped
  | 'stopped_by_system' // the phone's own Stop control
  | 'stopped_for_mission' // silenced to start the mission
  | 'dismissed_in_app' // Emergency Dismiss / skip mission in Terbit MY
  | 'turned_off' // turned off in Terbit MY (alarm without a mission)
  | 'unanswered' // closed with no response recorded
  | 'cancelled';

export type MissionOutcome =
  | 'not_required' // the alarm has no mission
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped' // the morning ended without the mission being started
  | 'abandoned'; // started but never finished

/** What a morning must achieve to qualify. `alarm_answered`: any recorded response to the alarm. */
export type EligibilityRule = 'mission_completed' | 'alarm_answered' | 'never';

export type ModePolicy = {
  label: string;
  /** One-line explanation for the alarm editor. */
  description: string;
  /** Challenge: the alarm screen leads straight into the mission. */
  missionFirst: boolean;
  /** The one-tap action on the system alarm (iOS AlarmKit button, Android alarm screen). */
  primaryActionLabel: string;
  /** Gentle: a follow-up reminder is due if the mission isn't done after the alarm stops. */
  followUp: boolean;
  reward: EligibilityRule;
  streak: EligibilityRule;
};

export const MODE_POLICIES: Record<CompletionMode, ModePolicy> = {
  reward: {
    label: 'Reward',
    description:
      'Stop the alarm normally. Completing the mission (then or later that morning) earns the morning’s reward and streak.',
    missionFirst: false,
    primaryActionLabel: 'Stop & Open Terbit',
    followUp: false,
    reward: 'mission_completed',
    streak: 'mission_completed',
  },
  challenge: {
    label: 'Challenge',
    description:
      'The alarm leads straight into the mission. The morning stays incomplete until the mission is done. The phone’s Stop button still works, but stopping early is recorded.',
    missionFirst: true,
    primaryActionLabel: 'Stop & Start Mission',
    followUp: false,
    reward: 'mission_completed',
    streak: 'mission_completed',
  },
  gentle: {
    label: 'Gentle',
    description:
      'Stop the alarm normally. If the mission isn’t done, Terbit MY reminds you after the delay you choose.',
    missionFirst: false,
    primaryActionLabel: 'Stop & Open Terbit',
    followUp: true,
    reward: 'mission_completed',
    streak: 'mission_completed',
  },
};

export type MorningEvaluation = {
  mode: CompletionMode;
  alarmOutcome: AlarmOutcome;
  missionOutcome: MissionOutcome;
  /** No more changes possible. */
  finished: boolean;
  /** The morning's goal is met: mission completed, or the alarm (without a mission) was turned off. */
  morningComplete: boolean;
  rewardEligible: boolean;
  streakEligible: boolean;
  /** Gentle mode: when a follow-up reminder is due, while the mission is still open. Otherwise null. */
  followUpAt: number | null;
  /** Plain-language summary for history. */
  summary: string;
};

function alarmOutcome(o: AlarmOccurrence): AlarmOutcome {
  if (o.status === 'scheduled') return 'pending';
  if (o.status === 'cancelled') return 'cancelled';
  switch (o.alarmStopReason) {
    case 'system':
      return 'stopped_by_system';
    case 'mission':
      return 'stopped_for_mission';
    case 'dismiss':
      return 'dismissed_in_app';
    case 'turn_off':
      return 'turned_off';
  }
  if (!isActive(o)) return 'unanswered';
  return o.fireEvidence === 'schedule' ? 'fired' : 'ringing';
}

function missionOutcome(o: AlarmOccurrence): MissionOutcome {
  if (o.mission.type === 'none') return 'not_required';
  if (o.status === 'completed' && o.result?.kind === 'mission_completed') return 'completed';
  if (o.missionStartedAt !== null) return isActive(o) ? 'in_progress' : 'abandoned';
  if (!isActive(o) && o.status !== 'cancelled') return 'skipped';
  return 'not_started';
}

function meets(rule: EligibilityRule, alarm: AlarmOutcome, mission: MissionOutcome): boolean {
  switch (rule) {
    case 'mission_completed':
      return mission === 'completed';
    case 'alarm_answered':
      return !['pending', 'ringing', 'fired', 'unanswered', 'cancelled'].includes(alarm);
    case 'never':
      return false;
  }
}

function summarise(o: AlarmOccurrence, alarm: AlarmOutcome, mission: MissionOutcome, mode: CompletionMode): string {
  if (alarm === 'pending') return 'Scheduled';
  if (alarm === 'cancelled') return 'Cancelled';
  if (mission === 'completed') return 'Mission completed';
  if (mission === 'not_required') return o.status === 'completed' ? 'Alarm turned off (no mission)' : 'Missed';
  if (mission === 'in_progress') return 'Mission in progress';
  if (mission === 'abandoned') return 'Mission abandoned';
  const incomplete = mode === 'challenge' ? 'Challenge incomplete' : 'Mission not done';
  if (isActive(o)) {
    if (alarm === 'stopped_by_system') return 'Alarm stopped, mission not done yet';
    return alarm === 'fired' ? 'Alarm went off' : 'Alarm ringing';
  }
  // Finished without the mission ever starting.
  if (alarm === 'stopped_by_system') return `Stopped with phone controls · ${incomplete}`;
  if (alarm === 'dismissed_in_app') return `Dismissed in Terbit MY · ${incomplete}`;
  return 'Missed (no response recorded)';
}

/**
 * Judges one morning. `mode` defaults to the mode the alarm had that morning
 * (copied onto the occurrence); pass another to try a different policy.
 */
export function evaluateMorning(
  o: AlarmOccurrence,
  mode: CompletionMode = o.completionMode,
  policies: Record<CompletionMode, ModePolicy> = MODE_POLICIES,
): MorningEvaluation {
  const policy = policies[mode];
  const alarm = alarmOutcome(o);
  const mission = missionOutcome(o);
  const open = isActive(o) && o.status !== 'scheduled';
  return {
    mode,
    alarmOutcome: alarm,
    missionOutcome: mission,
    finished: !isActive(o),
    morningComplete: o.status === 'completed',
    rewardEligible: meets(policy.reward, alarm, mission),
    streakEligible: meets(policy.streak, alarm, mission),
    followUpAt: policy.followUp && open && mission !== 'not_required' ? followUpAt(o) : null,
    summary: summarise(o, alarm, mission, mode),
  };
}

export function isRewardEligible(
  o: AlarmOccurrence,
  mode: CompletionMode = o.completionMode,
  policies: Record<CompletionMode, ModePolicy> = MODE_POLICIES,
): boolean {
  return evaluateMorning(o, mode, policies).rewardEligible;
}

export function isStreakEligible(
  o: AlarmOccurrence,
  mode: CompletionMode = o.completionMode,
  policies: Record<CompletionMode, ModePolicy> = MODE_POLICIES,
): boolean {
  return evaluateMorning(o, mode, policies).streakEligible;
}
