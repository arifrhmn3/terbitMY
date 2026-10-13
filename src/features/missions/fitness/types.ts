import type { MissionDifficulty } from '../types';

/**
 * The user's Mobility Profile (Settings → Accessibility; later also asked
 * during onboarding). Each profile has its own catalogue of activities.
 */
export type MobilityProfile = 'standard' | 'reduced_mobility' | 'non_physical';

export const MOBILITY_PROFILES: readonly MobilityProfile[] = ['standard', 'reduced_mobility', 'non_physical'];

/** Standard catalogue. */
export type StandardExercise = 'pushups' | 'squats' | 'jumping_jacks' | 'stretch' | 'walk_in_place';
/** Reduced-mobility catalogue. */
export type ReducedMobilityExercise = 'wall_push' | 'chair_sit_to_stand' | 'step_out' | 'seated_stretch' | 'seated_marching';
/** Non-physical catalogue: neutral accountability activities, not exercise. */
export type NonPhysicalActivity = 'controlled_breathing' | 'number_focus' | 'hold_release' | 'grounding';

/** Every Fitness-mission activity, from any catalogue (what an alarm and a result store). */
export type FitnessExercise = StandardExercise | ReducedMobilityExercise | NonPhysicalActivity;

export const FITNESS_EXERCISES: readonly FitnessExercise[] = [
  'pushups',
  'squats',
  'jumping_jacks',
  'stretch',
  'walk_in_place',
  'wall_push',
  'chair_sit_to_stand',
  'step_out',
  'seated_stretch',
  'seated_marching',
  'controlled_breathing',
  'number_focus',
  'hold_release',
  'grounding',
];

/**
 * How progress is counted:
 * - reps: one deliberate tap per repetition;
 * - timed: keep going until the timer ends (optionally with guided cues);
 * - holds: press and hold, then release (each long-enough hold counts);
 * - sequence: tap the numbers in order (each completed round counts).
 */
export type FitnessKind = 'reps' | 'timed' | 'holds' | 'sequence';

/**
 * How the result is known (the completion method):
 * - self_reported: tapped after each rep, or timed;
 * - task_checked: the number-focus task checks each tap;
 * - camera_verified: every rep was counted by on-device pose detection
 *   (Phase 4.5: push-ups, squats, jumping jacks, chair sit-to-stand). Same XP as self-reported; a
 *   future rule could make it recommended or required in Challenge mode.
 * Stored inside the occurrence's result JSON, so older results stay valid.
 */
export type FitnessVerification = 'self_reported' | 'task_checked' | 'camera_verified';

export type FitnessMissionConfig = {
  exercise: FitnessExercise;
  difficulty: MissionDifficulty;
  /** "Get ready" countdown in ms (accessibility pacing). Default: FITNESS_COUNTDOWN_MS. */
  countdownMs?: number;
};

export type FitnessMissionResult = {
  type: 'fitness';
  /** The activity actually done (its catalogue tells the Mobility Profile). */
  exercise: FitnessExercise;
  difficulty: MissionDifficulty;
  kind: FitnessKind;
  /** Reps, seconds, holds or rounds, depending on `kind`. */
  target: number;
  achieved: number;
  /** From Start (after the countdown) to done, in ms. */
  durationMs: number;
  verification: FitnessVerification;
  /** Only on results saved before Phase 3D (always 'standard'). */
  adaptation?: 'standard';
};
