import type { MissionDifficulty } from '../types';

export type FitnessExercise = 'pushups' | 'squats' | 'jumping_jacks' | 'stretch' | 'walk_in_place';

export const FITNESS_EXERCISES: readonly FitnessExercise[] = ['pushups', 'squats', 'jumping_jacks', 'stretch', 'walk_in_place'];

/** Rep-based (count each repetition) or timed (keep going until the timer ends). */
export type FitnessKind = 'reps' | 'timed';

/**
 * How the mission is adapted for the person doing it. Only 'standard' exists
 * in Phase 3B. Planned additions (accessibility, Phase 3D):
 * 'reduced_mobility' (e.g. wall push-ups, chair squats, seated stretch) and
 * 'non_physical' (swap for an Education mission). Stored with the mission,
 * so adding them needs no data change.
 */
export type FitnessAdaptation = 'standard';

/**
 * How the result is known. Phase 3B is self-reported only (no camera); a
 * later camera/pose-detection mode would record 'verified'.
 */
export type FitnessVerification = 'self_reported';

export type FitnessMissionConfig = {
  exercise: FitnessExercise;
  difficulty: MissionDifficulty;
  adaptation?: FitnessAdaptation;
};

export type FitnessMissionResult = {
  type: 'fitness';
  exercise: FitnessExercise;
  difficulty: MissionDifficulty;
  kind: FitnessKind;
  /** Reps, or seconds for timed exercises. */
  target: number;
  /** Reps counted, or seconds completed. */
  achieved: number;
  /** From Start (after the countdown) to done, in ms. */
  durationMs: number;
  verification: FitnessVerification;
  adaptation: FitnessAdaptation;
};
