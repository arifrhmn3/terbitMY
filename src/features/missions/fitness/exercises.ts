import type { MissionDifficulty } from '../types';

import type { FitnessExercise, FitnessKind, MobilityProfile } from './types';

export type ExerciseDefinition = {
  id: FitnessExercise;
  /** The catalogue (Mobility Profile) this activity belongs to. */
  profile: MobilityProfile;
  label: string;
  /** Short label for segmented controls. */
  short: string;
  kind: FitnessKind;
  /** One or two sentences on how to do it. */
  howTo: string;
  /**
   * Reps only: the fastest a single rep can be counted, in ms. Taps faster
   * than this are ignored, so the mission can't be finished by tapping
   * quickly. Prototype values.
   */
  minRepIntervalMs?: number;
  /** Holds only: how long each press must be held to count, in ms. */
  minHoldMs?: number;
  /** Timed only: guidance shown in turn, each for `cueEveryMs`. */
  cues?: readonly string[];
  cueEveryMs?: number;
};

/**
 * PROVISIONAL FITNESS CONFIG. Each Mobility Profile has its own catalogue;
 * all activities share the rep / timer / hold / sequence building blocks in
 * `session.ts`. Targets and anti-tap limits live here (XP lives in the
 * progression policy). Beta can change any value here without touching
 * screens or stored data.
 */
export const EXERCISES: Record<FitnessExercise, ExerciseDefinition> = {
  // Standard
  pushups: {
    id: 'pushups',
    profile: 'standard',
    label: 'Push-ups',
    short: 'Push-ups',
    kind: 'reps',
    howTo: 'Hands under your shoulders, body straight. Lower your chest, then push back up. Knees down is fine.',
    minRepIntervalMs: 900,
  },
  squats: {
    id: 'squats',
    profile: 'standard',
    label: 'Squats',
    short: 'Squats',
    kind: 'reps',
    howTo: 'Feet shoulder-width apart. Sit back as if onto a chair, then stand up tall.',
    minRepIntervalMs: 900,
  },
  jumping_jacks: {
    id: 'jumping_jacks',
    profile: 'standard',
    label: 'Jumping jacks',
    short: 'Jacks',
    kind: 'reps',
    howTo: 'Jump your feet apart while raising your arms overhead, then jump back together.',
    minRepIntervalMs: 450,
  },
  stretch: {
    id: 'stretch',
    profile: 'standard',
    label: 'Stretch',
    short: 'Stretch',
    kind: 'timed',
    howTo: 'Gently stretch your arms, shoulders, back and legs. Breathe slowly; never stretch into pain.',
  },
  walk_in_place: {
    id: 'walk_in_place',
    profile: 'standard',
    label: 'Walk in place',
    short: 'Walk',
    kind: 'timed',
    howTo: 'March on the spot, lifting your knees and swinging your arms.',
  },

  // Reduced mobility
  wall_push: {
    id: 'wall_push',
    profile: 'reduced_mobility',
    label: 'Wall push',
    short: 'Wall push',
    kind: 'reps',
    howTo: 'Stand an arm’s length from a wall, hands on the wall at shoulder height. Bend your elbows towards the wall, then push back.',
    minRepIntervalMs: 900,
  },
  chair_sit_to_stand: {
    id: 'chair_sit_to_stand',
    profile: 'reduced_mobility',
    label: 'Chair sit-to-stand',
    short: 'Sit-stand',
    kind: 'reps',
    howTo: 'Sit on a sturdy chair. Stand up, using your hands on the chair if you need to, then sit back down slowly.',
    minRepIntervalMs: 1200,
  },
  step_out: {
    id: 'step_out',
    profile: 'reduced_mobility',
    label: 'Step-out movement',
    short: 'Step-out',
    kind: 'reps',
    howTo: 'Step one foot out to the side while raising your arms, then step back. Alternate sides. Seated is fine too.',
    minRepIntervalMs: 700,
  },
  seated_stretch: {
    id: 'seated_stretch',
    profile: 'reduced_mobility',
    label: 'Seated stretch',
    short: 'Stretch',
    kind: 'timed',
    howTo: 'Sitting comfortably, gently stretch your arms, shoulders, neck and back. Breathe slowly; never stretch into pain.',
  },
  seated_marching: {
    id: 'seated_marching',
    profile: 'reduced_mobility',
    label: 'Seated marching',
    short: 'March',
    kind: 'timed',
    howTo: 'Sitting tall, lift one knee then the other, swinging your arms if you can.',
  },

  // Non-physical (neutral accountability activities, not exercise)
  controlled_breathing: {
    id: 'controlled_breathing',
    profile: 'non_physical',
    label: 'Controlled breathing',
    short: 'Breathe',
    kind: 'timed',
    howTo: 'Sit or lie comfortably and follow the guide: breathe in slowly, then breathe out a little longer.',
    cues: ['Breathe in… 2… 3… 4', 'Breathe out… 2… 3… 4… 5… 6'],
    cueEveryMs: 5000,
  },
  number_focus: {
    id: 'number_focus',
    profile: 'non_physical',
    label: 'Number focus',
    short: 'Focus',
    kind: 'sequence',
    howTo: 'Tap the numbers 1 to 9 in order. They’re shuffled each round, so take your time and look carefully.',
  },
  hold_release: {
    id: 'hold_release',
    profile: 'non_physical',
    label: 'Hold and release',
    short: 'Hold',
    kind: 'holds',
    howTo: 'Press and hold the button until it says release, then let go. Each full hold counts.',
    minHoldMs: 3000,
  },
  grounding: {
    id: 'grounding',
    profile: 'non_physical',
    label: 'Grounding',
    short: 'Ground',
    kind: 'timed',
    howTo: 'Notice what’s around you, one sense at a time, following the prompts.',
    cues: [
      'Notice five things you can see.',
      'Notice four things you can feel.',
      'Notice three things you can hear.',
      'Notice two things you can smell.',
      'Notice one slow, full breath.',
    ],
    cueEveryMs: 12_000,
  },
};

/** Each Mobility Profile's catalogue, in display order. */
export const FITNESS_CATALOGUES: Record<MobilityProfile, readonly FitnessExercise[]> = {
  standard: ['pushups', 'squats', 'jumping_jacks', 'stretch', 'walk_in_place'],
  reduced_mobility: ['wall_push', 'chair_sit_to_stand', 'step_out', 'seated_stretch', 'seated_marching'],
  non_physical: ['controlled_breathing', 'number_focus', 'hold_release', 'grounding'],
};

/** Target per difficulty: reps, seconds, holds or rounds (by kind). Prototype values. */
export const FITNESS_TARGETS: Record<FitnessExercise, Record<MissionDifficulty, number>> = {
  pushups: { easy: 5, medium: 10, hard: 20 },
  squats: { easy: 10, medium: 20, hard: 30 },
  jumping_jacks: { easy: 15, medium: 30, hard: 50 },
  stretch: { easy: 30, medium: 60, hard: 120 },
  walk_in_place: { easy: 60, medium: 120, hard: 180 },
  wall_push: { easy: 8, medium: 15, hard: 25 },
  chair_sit_to_stand: { easy: 5, medium: 10, hard: 15 },
  step_out: { easy: 15, medium: 30, hard: 45 },
  seated_stretch: { easy: 30, medium: 60, hard: 120 },
  seated_marching: { easy: 60, medium: 120, hard: 180 },
  controlled_breathing: { easy: 60, medium: 120, hard: 180 },
  number_focus: { easy: 1, medium: 2, hard: 3 },
  hold_release: { easy: 5, medium: 8, hard: 12 },
  grounding: { easy: 60, medium: 90, hard: 120 },
};

/** "Get ready" countdown before an activity starts, in ms (Normal pacing; Extended is in the accessibility policy). */
export const FITNESS_COUNTDOWN_MS = 3000;

/** Number focus: the numbers in each round. */
export const SEQUENCE_LENGTH = 9;

export function fitnessTarget(exercise: FitnessExercise, difficulty: MissionDifficulty): number {
  return FITNESS_TARGETS[exercise][difficulty];
}

export function catalogueFor(profile: MobilityProfile): readonly FitnessExercise[] {
  return FITNESS_CATALOGUES[profile];
}

/**
 * The activity an alarm runs for this profile. An activity from the
 * profile's own catalogue runs as saved. One saved under another profile
 * (the user changed profile since) runs the activity in the same place in
 * the current catalogue. Internal only: the app just shows the current
 * catalogue.
 */
export function activityForProfile(exercise: FitnessExercise, profile: MobilityProfile): FitnessExercise {
  const own = FITNESS_CATALOGUES[profile];
  if (own.includes(exercise)) return exercise;
  const position = FITNESS_CATALOGUES[EXERCISES[exercise].profile].indexOf(exercise);
  return own[Math.min(Math.max(position, 0), own.length - 1)];
}

/** "20 reps" / "2 min" / "8 holds" / "2 rounds". */
export function formatAmount(exercise: FitnessExercise, amount: number): string {
  switch (EXERCISES[exercise].kind) {
    case 'reps':
      return `${amount} reps`;
    case 'holds':
      return amount === 1 ? '1 hold' : `${amount} holds`;
    case 'sequence':
      return amount === 1 ? '1 round' : `${amount} rounds`;
    case 'timed':
      return formatSeconds(amount);
  }
}

export function formatTarget(exercise: FitnessExercise, difficulty: MissionDifficulty): string {
  return formatAmount(exercise, fitnessTarget(exercise, difficulty));
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}
