import type { AlarmMission } from '@/features/alarms/alarm';
import { activityForProfile } from '@/features/missions/fitness/exercises';
import { MOBILITY_PROFILES, type FitnessMissionConfig, type MobilityProfile } from '@/features/missions/fitness/types';

import { oneOf } from '../settings/preference-store';

export const ACCESSIBILITY_SETTINGS_KEY = 'accessibility.settings';

/**
 * The Mobility Profile choice, written so the same options can be offered
 * during first-run onboarding (Phase 6) as well as in Settings.
 */
export const MOBILITY_PROFILE_OPTIONS: readonly { value: MobilityProfile; label: string; description: string }[] = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Push-ups, squats, jumping jacks, stretching and walking in place.',
  },
  {
    value: 'reduced_mobility',
    label: 'Reduced mobility',
    description: 'Gentler movements, many done seated or with support: wall push, chair sit-to-stand, seated marching and more.',
  },
  {
    value: 'non_physical',
    label: 'Non-physical',
    description: 'No movement needed: controlled breathing, number focus, hold and release, and grounding.',
  },
];

export const MOBILITY_PROFILE_LABEL = Object.fromEntries(MOBILITY_PROFILE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  MobilityProfile,
  string
>;

/** How much time missions give you to get going. Extended never lowers a target. */
export type MissionPacing = 'normal' | 'extended';
export const MISSION_PACINGS: readonly MissionPacing[] = ['normal', 'extended'];
export const MISSION_PACING_LABEL: Record<MissionPacing, string> = { normal: 'Normal', extended: 'Extended' };

export type AccessibilitySettings = {
  /** A personal setting for every Fitness alarm: which catalogue of activities you see and do. */
  mobilityProfile: MobilityProfile;
  missionPacing: MissionPacing;
};

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  mobilityProfile: 'standard',
  missionPacing: 'normal',
};

/**
 * PROVISIONAL ACCESSIBILITY POLICY. Every accessibility number lives here.
 *
 * - Pacing changes only the time to get ready, never the target: the
 *   accountability requirement stays the same.
 * - The Mobility Profile never changes XP: every Fitness mission earns what
 *   the progression policy gives Fitness at that difficulty, whichever
 *   catalogue it came from. (Whether fully non-physical activities should
 *   count as "Fitness" XP is an open product decision; see PROJECT_STATUS.)
 */
export const ACCESSIBILITY_POLICY = {
  /** "Get ready" countdown before a Fitness mission starts, in ms. */
  fitnessCountdownMs: { normal: 3000, extended: 10_000 } satisfies Record<MissionPacing, number>,
};

export function normaliseAccessibilitySettings(value: unknown): AccessibilitySettings {
  const v = (value ?? {}) as Partial<Record<keyof AccessibilitySettings | 'fitnessAdaptation', unknown>>;
  return {
    // Development builds before this change saved the same choice as `fitnessAdaptation`.
    mobilityProfile: oneOf(v.mobilityProfile ?? v.fitnessAdaptation, MOBILITY_PROFILES, DEFAULT_ACCESSIBILITY_SETTINGS.mobilityProfile),
    missionPacing: oneOf(v.missionPacing, MISSION_PACINGS, DEFAULT_ACCESSIBILITY_SETTINGS.missionPacing),
  };
}

export function fitnessCountdownMs(pacing: MissionPacing): number {
  return ACCESSIBILITY_POLICY.fitnessCountdownMs[pacing];
}

/**
 * The Fitness mission as it runs for this user: the alarm's activity from
 * their Mobility Profile's catalogue, at the alarm's difficulty, with their
 * pacing. (Mission type and difficulty are all that XP depends on.)
 */
export function fitnessConfigFor(config: FitnessMissionConfig, settings: AccessibilitySettings): FitnessMissionConfig {
  return {
    exercise: activityForProfile(config.exercise, settings.mobilityProfile),
    difficulty: config.difficulty,
    countdownMs: fitnessCountdownMs(settings.missionPacing),
  };
}

/** An alarm's mission as it runs (and is described) for this Mobility Profile. Other missions are unchanged. */
export function missionForProfile(mission: AlarmMission, profile: MobilityProfile): AlarmMission {
  return mission.type === 'fitness' ? { ...mission, exercise: activityForProfile(mission.exercise, profile) } : mission;
}
