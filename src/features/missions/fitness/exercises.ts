import type { MissionDifficulty } from '../types';

import type { FitnessExercise, FitnessKind } from './types';

export type ExerciseDefinition = {
  id: FitnessExercise;
  label: string;
  /** Short label for segmented controls. */
  short: string;
  kind: FitnessKind;
  /** One or two sentences on how to do it. */
  howTo: string;
  /**
   * Rep-based only: the fastest a single rep can be counted, in ms. Taps
   * faster than this are ignored, so the mission can't be finished by
   * tapping quickly. Prototype values.
   */
  minRepIntervalMs?: number;
  /**
   * Accessibility (planned, Phase 3D): an easier version of the same
   * movement for reduced mobility. Listed now so the data is ready.
   */
  reducedMobilityAlternative?: string;
};

/**
 * PROVISIONAL FITNESS CONFIG. All exercise targets and anti-tap limits live
 * here (XP lives in the progression policy). Beta can change any value here
 * without touching screens or stored data.
 */
export const EXERCISES: Record<FitnessExercise, ExerciseDefinition> = {
  pushups: {
    id: 'pushups',
    label: 'Push-ups',
    short: 'Push-ups',
    kind: 'reps',
    howTo: 'Hands under your shoulders, body straight. Lower your chest, then push back up. Knees down is fine.',
    minRepIntervalMs: 900,
    reducedMobilityAlternative: 'Wall push-ups',
  },
  squats: {
    id: 'squats',
    label: 'Squats',
    short: 'Squats',
    kind: 'reps',
    howTo: 'Feet shoulder-width apart. Sit back as if onto a chair, then stand up tall.',
    minRepIntervalMs: 900,
    reducedMobilityAlternative: 'Sit-to-stand from a chair',
  },
  jumping_jacks: {
    id: 'jumping_jacks',
    label: 'Jumping jacks',
    short: 'Jacks',
    kind: 'reps',
    howTo: 'Jump your feet apart while raising your arms overhead, then jump back together.',
    minRepIntervalMs: 450,
    reducedMobilityAlternative: 'Step-out jacks (no jump)',
  },
  stretch: {
    id: 'stretch',
    label: 'Stretch',
    short: 'Stretch',
    kind: 'timed',
    howTo: 'Gently stretch your arms, shoulders, back and legs. Breathe slowly; never stretch into pain.',
    reducedMobilityAlternative: 'Seated stretch',
  },
  walk_in_place: {
    id: 'walk_in_place',
    label: 'Walk in place',
    short: 'Walk',
    kind: 'timed',
    howTo: 'March on the spot, lifting your knees and swinging your arms.',
    reducedMobilityAlternative: 'Seated marching',
  },
};

/** Target per difficulty: reps for rep-based exercises, seconds for timed ones. Prototype values. */
export const FITNESS_TARGETS: Record<FitnessExercise, Record<MissionDifficulty, number>> = {
  pushups: { easy: 5, medium: 10, hard: 20 },
  squats: { easy: 10, medium: 20, hard: 30 },
  jumping_jacks: { easy: 15, medium: 30, hard: 50 },
  stretch: { easy: 30, medium: 60, hard: 120 },
  walk_in_place: { easy: 60, medium: 120, hard: 180 },
};

/** "Get ready" countdown before reps or the timer start, in ms. */
export const FITNESS_COUNTDOWN_MS = 3000;

export function fitnessTarget(exercise: FitnessExercise, difficulty: MissionDifficulty): number {
  return FITNESS_TARGETS[exercise][difficulty];
}

/** "20 reps" / "2 min" / "30 sec". */
export function formatTarget(exercise: FitnessExercise, difficulty: MissionDifficulty): string {
  const target = fitnessTarget(exercise, difficulty);
  if (EXERCISES[exercise].kind === 'reps') return `${target} reps`;
  return formatSeconds(target);
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}
