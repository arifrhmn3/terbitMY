import { EXERCISES } from '../exercises';
import type { FitnessExercise } from '../types';

import type { PoseFrame } from './types';
import { distance, heightIn, jointAngle, jointAt, sideAngle, type CameraActivity, type Side } from './verifier';

/**
 * CAMERA-VERIFIABLE ACTIVITIES (Phase 4.5). Each adapts to Terbit MY's
 * existing mission (same name, target and "1 rep"); the camera never
 * changes what a mission means. Every value is PROVISIONAL and tuned on the
 * iPhone. All measurements are taken from one frame and scaled by the
 * user's own body lengths, so there's no calibration step. Camera angles
 * that worked on the iPhone (13 Oct 2026): front-facing (12 o'clock) for all
 * three Standard activities, side-on as well for push-ups and squats. The
 * verifier picks whatever evidence the current view gives; the user never
 * chooses a "mode".
 */

type Base = 'Shoulder' | 'Elbow' | 'Wrist' | 'Hip' | 'Knee' | 'Ankle';

const either = (frame: PoseFrame, minConfidence: number, ...sets: (readonly Base[])[]) =>
  (['left', 'right'] as const).some((side) => sets.some((set) => set.every((j) => jointAt(frame, side, j, minConfidence))));

const anyOf = (frame: PoseFrame, minConfidence: number, ...joints: Base[]) =>
  (['left', 'right'] as const).some((side) => joints.some((j) => jointAt(frame, side, j, minConfidence)));

/** Upper body seen but the legs cut off: step back; nothing usable: move into view. */
function legsHint(frame: PoseFrame, c: number): string {
  if (!anyOf(frame, c, 'Shoulder', 'Hip')) return 'Move into view';
  if (!anyOf(frame, c, 'Ankle')) return 'Step back a little — keep your feet in frame';
  return 'Turn slightly so your hip, knee and ankle are clear';
}

/**
 * Shoulder height above the hands, in forearm lengths (both sides averaged
 * where seen). In a push-up the forearm stays roughly upright, so this reads
 * the same from the front, the side or an angle, and it can't be fooled by
 * the head. Top ≈ 2, a normal push-up ≈ 1.3–1.5, chest on the floor ≈ 0.5.
 */
function shoulderInForearms(frame: PoseFrame, c: number): number | null {
  return bothSides(frame, (side) => {
    const s = jointAt(frame, side, 'Shoulder', c);
    const e = jointAt(frame, side, 'Elbow', c);
    const w = jointAt(frame, side, 'Wrist', c);
    if (!s || !e || !w) return null;
    const forearm = distance(e, w, frame.aspect);
    return forearm > 0.01 ? (w.y - s.y) / forearm : null;
  });
}

/**
 * Push-ups: top → down → top. Front-facing (12 o'clock), side-on or angled;
 * one arm is enough. A normal recreational push-up (elbows to ~110–120°)
 * counts; the chest doesn't have to approach the floor.
 */
const pushups: CameraActivity = {
  exercise: 'pushups',
  sides: 'either',
  sideJoints: ['Shoulder', 'Wrist'],
  // One full arm, or (if the elbow is hidden) shoulder, wrist and hip.
  usable: (f, c) => either(f, c, ['Shoulder', 'Elbow', 'Wrist'], ['Shoulder', 'Wrist', 'Hip']),
  positioningHint: (f, c) => (anyOf(f, c, 'Shoulder', 'Elbow', 'Wrist', 'Hip') ? 'Keep one arm visible' : 'Move into view'),
  paths: [
    // PRIMARY, any view: the shoulders lower towards the hands (in forearm lengths).
    {
      id: 'lowering',
      group: 'lowering',
      weight: 1,
      measure: (f, _side, c) => shoulderInForearms(f, c),
      rest: 1.75,
      target: 1.5,
      moreHint: 'Lower a little more',
      backHint: 'Push all the way up',
    },
    // PRIMARY, side-on: the elbow bends and straightens (from the front this angle hardly changes; the path above covers it).
    {
      id: 'elbow',
      group: 'elbow',
      weight: 1,
      measure: (f, side, c) => sideAngle(f, side, ['Shoulder', 'Elbow', 'Wrist'], c),
      rest: 145,
      target: 120,
      moreHint: 'Lower a little more',
      backHint: 'Straighten your arms',
    },
    // SECONDARY (together), side-on with the elbow hidden: shoulder and hips lower towards the hands (in torso lengths).
    {
      id: 'shoulder',
      group: 'shoulder',
      weight: 0.6,
      measure: (f, side, c) => heightIn(f, side, 'Shoulder', 'Wrist', ['Shoulder', 'Hip'], c),
      rest: 0.82,
      target: 0.7,
      moreHint: 'Lower a little more',
      backHint: 'Push all the way up',
    },
    {
      id: 'hip',
      group: 'hip',
      weight: 0.4,
      measure: (f, side, c) => heightIn(f, side, 'Hip', 'Wrist', ['Shoulder', 'Hip'], c),
      rest: 0.33,
      target: 0.28,
      moreHint: 'Lower your whole body a little more',
      backHint: 'Push all the way up',
    },
  ],
  // Measured from leaving the top to being back (the ends are excluded), so ~0.6 of the real time:
  // this blocks detector glitches, not brisk genuine push-ups (~0.6–0.7 s).
  minCycleMs: 350,
  positioning: 'Place your phone about 2 m away. Front-facing or side-on both work. Keep your upper body and at least one arm clearly visible.',
  phrases: { notVisible: 'Keep one arm visible', start: 'Start at the top, arms straight', toTarget: 'Lower into the push-up', toRest: 'Good — push back up' },
};

/** Squats: standing → squat → standing. Front-facing (worked very well), angled or side-on; one leg is enough. */
const squats: CameraActivity = {
  exercise: 'squats',
  sides: 'either',
  sideJoints: ['Hip', 'Knee', 'Ankle'],
  usable: (f, c) => either(f, c, ['Hip', 'Knee', 'Ankle']),
  positioningHint: legsHint,
  paths: [
    // PRIMARY: a clear knee bend and return.
    {
      id: 'knee',
      group: 'knee',
      weight: 1,
      measure: (f, side, c) => sideAngle(f, side, ['Hip', 'Knee', 'Ankle'], c),
      rest: 155,
      target: 120,
      moreHint: 'A little lower',
      backHint: 'Stand all the way up',
    },
    // A smaller knee bend: supports the hip lowering (same group, so it never adds to the main knee path).
    {
      id: 'knee_bend',
      group: 'knee',
      weight: 0.3,
      measure: (f, side, c) => sideAngle(f, side, ['Hip', 'Knee', 'Ankle'], c),
      rest: 160,
      target: 145,
      moreHint: 'A little lower',
      backHint: 'Stand all the way up',
    },
    // SECONDARY: the hips lower towards the ankles (in shin lengths), with the knees or the shoulders.
    {
      id: 'hip',
      group: 'hip',
      weight: 0.7,
      measure: (f, side, c) => heightIn(f, side, 'Hip', 'Ankle', ['Knee', 'Ankle'], c),
      rest: 1.85,
      target: 1.65,
      moreHint: 'A little lower',
      backHint: 'Stand all the way up',
    },
    {
      id: 'shoulder',
      group: 'torso',
      weight: 0.4,
      measure: (f, side, c) => heightIn(f, side, 'Shoulder', 'Ankle', ['Knee', 'Ankle'], c),
      rest: 3.2,
      target: 2.95,
      moreHint: 'A little lower',
      backHint: 'Stand all the way up',
    },
  ],
  minCycleMs: 350,
  positioning: 'Place your phone 2–3 m away so your hips, knees and ankles are visible. Face the phone or turn slightly sideways.',
  phrases: { notVisible: 'Keep your hip, knee and ankle in view', start: 'Stand tall to start', toTarget: 'Lower into the squat', toRest: 'Good — stand back up' },
};

/** Both sides' average of a value (any side that can be measured). */
function bothSides(frame: PoseFrame, measure: (side: Side) => number | null): number | null {
  const values = (['left', 'right'] as const).map(measure).filter((v): v is number => v !== null);
  return values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
}

/** Shoulder-to-hip length (average of the visible sides): the unit for spreads. */
function torso(frame: PoseFrame, c: number): number | null {
  return bothSides(frame, (side) => {
    const s = jointAt(frame, side, 'Shoulder', c);
    const h = jointAt(frame, side, 'Hip', c);
    return s && h ? distance(s, h, frame.aspect) : null;
  });
}

function spread(frame: PoseFrame, joint: 'Ankle' | 'Knee', c: number): number | null {
  const l = jointAt(frame, 'left', joint, c);
  const r = jointAt(frame, 'right', joint, c);
  const unit = torso(frame, c);
  return l && r && unit && unit > 0.01 ? (Math.abs(l.x - r.x) * frame.aspect) / unit : null;
}

/** Jumping jacks: closed → open → closed. Facing the phone; arms AND legs (never arms or feet alone). */
const jumpingJacks: CameraActivity = {
  exercise: 'jumping_jacks',
  sides: 'both',
  sideJoints: [],
  usable: (f, c) => {
    const both = (j: 'Shoulder' | 'Hip' | 'Ankle' | 'Knee') => jointAt(f, 'left', j, c) && jointAt(f, 'right', j, c);
    const wrist = jointAt(f, 'left', 'Wrist', c) || jointAt(f, 'right', 'Wrist', c);
    return Boolean(both('Shoulder') && both('Hip') && wrist && (both('Ankle') || both('Knee')));
  },
  positioningHint: (f, c) => {
    if (!anyOf(f, c, 'Shoulder', 'Hip')) return 'Move into view';
    if (!anyOf(f, c, 'Wrist')) return 'Keep your arms in frame';
    return 'Step back a little — keep your feet in frame';
  },
  paths: [
    // ARMS: the arm swings up and out (angle at the shoulder, both sides averaged, so one arm can't do it alone).
    {
      id: 'arms',
      group: 'arms',
      weight: 0.6,
      measure: (f, _side, c) =>
        bothSides(f, (side) => {
          const h = jointAt(f, side, 'Hip', c);
          const s = jointAt(f, side, 'Shoulder', c);
          const w = jointAt(f, side, 'Wrist', c);
          return h && s && w ? jointAngle(h, s, w, f.aspect) : null;
        }),
      rest: 60,
      target: 110,
      moreHint: 'Raise your arms a little higher',
      backHint: 'Bring your arms down',
    },
    // LEGS: the feet jump apart (ankles), or the knees if the feet are out of view.
    {
      id: 'feet',
      group: 'legs',
      weight: 0.6,
      measure: (f, _side, c) => spread(f, 'Ankle', c),
      rest: 0.5,
      target: 0.75,
      moreHint: 'Jump your feet a little wider',
      backHint: 'Bring your feet back together',
    },
    {
      id: 'knees',
      group: 'legs',
      weight: 0.5,
      measure: (f, _side, c) => spread(f, 'Knee', c),
      rest: 0.42,
      target: 0.6,
      moreHint: 'Jump your feet a little wider',
      backHint: 'Bring your feet back together',
    },
  ],
  // Jumping jacks are naturally quick (~0.5 s); this only blocks glitches.
  minCycleMs: 250,
  positioning: 'Face the phone and step back until your arms and feet fit comfortably in frame (about 3 m).',
  phrases: { notVisible: 'Step back so your arms and legs fit in view', start: 'Feet together, arms down', toTarget: 'Jump out, arms up', toRest: 'Good — back together' },
};

/**
 * Chair sit-to-stand (Reduced mobility, optional and forgiving): standing ↔
 * seated, starting from either. Uses the body, never the chair. Thresholds
 * don't assume a full Standard range: "standing" is a knee of 145° or the
 * hips well above the knees.
 */
const sitToStand: CameraActivity = {
  exercise: 'chair_sit_to_stand',
  sides: 'either',
  sideJoints: ['Hip', 'Knee', 'Ankle'],
  usable: (f, c) => either(f, c, ['Hip', 'Knee', 'Ankle']),
  positioningHint: legsHint,
  paths: [
    {
      id: 'knee',
      group: 'knee',
      weight: 1,
      measure: (f, side, c) => sideAngle(f, side, ['Hip', 'Knee', 'Ankle'], c),
      rest: 145,
      target: 115,
      moreHint: 'Sit all the way down',
      backHint: 'Stand all the way up',
    },
    {
      id: 'hip',
      group: 'hip',
      weight: 1,
      measure: (f, side, c) => heightIn(f, side, 'Hip', 'Ankle', ['Knee', 'Ankle'], c),
      rest: 1.7,
      target: 1.35,
      moreHint: 'Sit all the way down',
      backHint: 'Stand all the way up',
    },
  ],
  // Measured cycle (~0.6 of the real time): 0.8 s ≈ a 1.3 s stand-and-sit. Quicker says "A little slower…".
  minCycleMs: 800,
  eitherStart: true,
  positioning: 'Place your phone 2–3 m away, level with the chair, so your hips, knees and ankles are visible. Side-on or slightly angled works best.',
  phrases: { notVisible: 'Keep your hip, knee and ankle in view', start: 'Sit or stand to start', toTarget: 'Sit down slowly', toRest: 'Stand up' },
};

export type CameraVerifiableExercise = 'pushups' | 'squats' | 'jumping_jacks' | 'chair_sit_to_stand';

export const CAMERA_ACTIVITIES: Record<CameraVerifiableExercise, CameraActivity> = {
  pushups,
  squats,
  jumping_jacks: jumpingJacks,
  chair_sit_to_stand: sitToStand,
};

/** Can the camera verify this activity? Never for the Non-physical profile. */
export function isCameraVerifiable(exercise: FitnessExercise): exercise is CameraVerifiableExercise {
  return exercise in CAMERA_ACTIVITIES && EXERCISES[exercise].profile !== 'non_physical';
}

/**
 * The whole catalogue, classified (Phase 4.5 audit). "later": a genuine
 * candidate, deferred until it can be made reliable; "not_suitable": the
 * camera wouldn't add meaningful accountability (or would become form policing).
 */
export const CAMERA_CATALOGUE: Record<FitnessExercise, { status: 'enabled' | 'later' | 'not_suitable'; why: string }> = {
  pushups: { status: 'enabled', why: 'Clear elbow cycle; shoulder and hip lowering as a second path.' },
  squats: { status: 'enabled', why: 'Clear knee cycle; hip lowering with knees or shoulders as a second path.' },
  jumping_jacks: { status: 'enabled', why: 'Clear closed → open → closed of arms and legs together.' },
  stretch: { status: 'not_suitable', why: 'Static and varied: the camera would only add friction or form policing.' },
  walk_in_place: { status: 'later', why: 'Timed: needs continuous-movement verification (alternating legs, active time), not reps.' },
  wall_push: { status: 'later', why: 'Elbow cycle like a push-up, but inclusive ranges for reduced mobility need testing first.' },
  chair_sit_to_stand: { status: 'enabled', why: 'Large, unmistakable hip and knee movement; forgiving thresholds; either start.' },
  step_out: { status: 'later', why: 'Alternates sides and may be seated, so "one rep" looks different per user; needs its own testing.' },
  seated_stretch: { status: 'not_suitable', why: 'Static and varied.' },
  seated_marching: { status: 'later', why: 'Timed: needs continuous-movement verification (alternating knee lifts).' },
  controlled_breathing: { status: 'not_suitable', why: 'Non-physical profile: never camera.' },
  number_focus: { status: 'not_suitable', why: 'Non-physical profile: never camera.' },
  hold_release: { status: 'not_suitable', why: 'Non-physical profile: never camera.' },
  grounding: { status: 'not_suitable', why: 'Non-physical profile: never camera.' },
};
