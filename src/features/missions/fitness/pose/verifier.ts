import type { FitnessExercise } from '../types';

import type { JointName, PoseFrame, PoseJoint } from './types';

/**
 * CAMERA MOVEMENT VERIFICATION (Phase 4.5): one shared engine; each activity
 * only describes its movement (`camera-activities.ts`). Pure: frames in,
 * reps and feedback out, so every rule is unit-tested without a camera.
 *
 * Purpose: accountability ("did you really do it?"), not form judging. A
 * normal genuine rep should count; small fake motions, jitter and moving an
 * irrelevant body part shouldn't.
 *
 * MULTI-SIGNAL EVIDENCE: an activity has several evidence paths (joint
 * angles, body-proportion heights, spreads), each with a weight and a group.
 * A rep's movement counts as reaching the target when the groups reached in
 * that rep add up to 1: one strong path is enough, or several supporting
 * ones together. Paths in the same group never add up (the best counts).
 *
 * MOVEMENT STATES: home ─► leaving ─► away ─► home = 1 rep.
 * "home" is the start position (top / standing / closed), or for activities
 * that may start at either end (sit-to-stand), whichever end the user starts at.
 *
 * Protections: minimum joint confidence; exercise-specific readiness (only
 * the joints the movement needs); a stable side for one-sided movements;
 * light smoothing (a quick movement still counts when its unsmoothed value
 * holds the target for 2 frames); endpoint thresholds with a dead zone
 * between them; a minimum cycle time per activity; losing the body for
 * `lostAfterMs` resets the rep in progress, never the reps already counted.
 *
 * SPEED: a cycle shorter than `glitchMs` is a detector glitch and is
 * ignored silently. A plausible movement that's too quick to verify (under
 * the activity's minimum, or the target only glimpsed for one frame) says
 * "A little slower so I can count the full movement" instead of failing silently.
 *
 * STEADY: `steadySince` tracks how long the usable body has stayed still
 * (for the automatic start: hold still ~1 s, then the countdown runs).
 */

export type Side = 'left' | 'right';
export type JointBase = 'Shoulder' | 'Elbow' | 'Wrist' | 'Hip' | 'Knee' | 'Ankle';

export type EvidencePath = {
  id: string;
  /** Paths in one group don't add up; the best reached one counts. */
  group: string;
  /** 1 = enough on its own; less = supporting evidence. Paths of 0.5 or more also decide the start position. */
  weight: number;
  /** The value on this frame (null: not measurable on this frame). */
  measure: (frame: PoseFrame, side: Side | null, minConfidence: number) => number | null;
  /** The value at the start position and at the target position (either direction). */
  rest: number;
  target: number;
  /** Plain, neutral guidance when this path falls short ("Lower a little more"), and when it hasn't returned ("Straighten your arms"). */
  moreHint: string;
  backHint: string;
};

export type CameraActivity = {
  exercise: FitnessExercise;
  /** 'either': measured on the clearer side (kept for the rep); 'both': uses both sides together. */
  sides: 'either' | 'both';
  /** The joints that decide which side is clearer ('either' only). */
  sideJoints: readonly JointBase[];
  /** The minimum usable pose (only what this movement needs). */
  usable: (frame: PoseFrame, minConfidence: number) => boolean;
  paths: readonly EvidencePath[];
  /** The fastest believable full cycle (rejects jitter, not normal speed). */
  minCycleMs: number;
  /** May start at either end (e.g. seated or standing). */
  eitherStart?: boolean;
  /** Shown while setting up. */
  positioning: string;
  /** What to fix when the pose isn't usable ("Step back a little", "Keep one arm visible"), or null for the default. */
  positioningHint?: (frame: PoseFrame, minConfidence: number) => string | null;
  phrases: {
    /** Body not usable. */
    notVisible: string;
    /** Ready, waiting for a start position. */
    start: string;
    /** At the start position: go to the target. */
    toTarget: string;
    /** At the target end: go back. */
    toRest: string;
  };
};

export const VERIFIER_DEFAULTS = {
  minConfidence: 0.3,
  /** Usable frames in a row before "Ready" (~0.4 s at 15 frames a second). */
  readyFrames: 6,
  /** No usable body for this long: the rep in progress is dropped (reps already counted stay). */
  lostAfterMs: 800,
  /** Smoothing: each new value moves the average this much (light, so short movements still reach the target). */
  smoothing: 0.6,
  /** At the start position: within this share of the way to the target. */
  restBand: 0.1,
  /** Stuck between the ends this long after reaching the target: say what's left. */
  lingerMs: 1200,
  /** How long a "Rep counted" / hint stays on screen. */
  messageMs: 1500,
  /** A full cycle shorter than this is a detector glitch, ignored without a message (~3 frames). */
  glitchMs: 200,
  /** Unsmoothed frames in a row at the target that count as reaching it (fast but real movements). */
  rawFrames: 2,
  /** The usable body moving less than this per frame (share of the image) counts as holding still. */
  steadyMotion: 0.03,
} as const;

export const SLOW_DOWN = 'A little slower so I can count the full movement';

export type Readiness = 'not_visible' | 'positioning' | 'ready';
export type VerifierEvent = 'counted' | 'too_fast' | 'partial';

export type VerifierState = {
  readiness: Readiness;
  usableFrames: number;
  lastUsableAt: number | null;
  side: Side | null;
  /** Smoothed value per path id (absent: not measurable right now). */
  values: Record<string, number>;
  phase: 'unknown' | 'home' | 'leaving' | 'away';
  home: 'rest' | 'target' | null;
  /** The last moment at the start position (a rep's start). */
  homeAt: number | null;
  /** Paths (ids) that reached the target during this rep (when home is the rest end). */
  reached: string[];
  /** The last moment the rep made progress (for "say what's left"). */
  progressAt: number | null;
  /** Completed reps: never reduced by losing the body. */
  reps: number;
  last: { event: VerifierEvent; at: number; hint: string | null } | null;
  /** Unsmoothed frames in a row at the target, per path id. */
  streak: Record<string, number>;
  /** Paths whose unsmoothed value touched the target during this rep (a too-quick movement). */
  glimpsed: string[];
  /** Since when the usable body has held still (null: moving or not usable). */
  steadySince: number | null;
  /** The previous usable frame's joints (for stillness). */
  previous: PoseFrame['joints'] | null;
  /** What to fix while the pose isn't usable. */
  hint: string | null;
};

export const initialVerifier: VerifierState = {
  readiness: 'not_visible',
  usableFrames: 0,
  lastUsableAt: null,
  side: null,
  values: {},
  phase: 'unknown',
  home: null,
  homeAt: null,
  reached: [],
  progressAt: null,
  reps: 0,
  last: null,
  streak: {},
  glimpsed: [],
  steadySince: null,
  previous: null,
  hint: null,
};

/* ---------- Geometry (shared by every activity) ---------- */

/** A joint if it's confident enough. Side-relative names: `at(frame, 'left', 'Elbow')`. */
export function jointAt(frame: PoseFrame, side: Side, base: JointBase, minConfidence: number): PoseJoint | null {
  const j = frame.joints[`${side}${base}` as JointName];
  return j && j.c >= minConfidence ? j : null;
}

export function jointNamed(frame: PoseFrame, name: JointName, minConfidence: number): PoseJoint | null {
  const j = frame.joints[name];
  return j && j.c >= minConfidence ? j : null;
}

/** The angle at b (degrees, 0–180), with x scaled to the image's real proportions. */
export function jointAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, aspect = 1): number {
  const v1 = { x: (a.x - b.x) * aspect, y: a.y - b.y };
  const v2 = { x: (c.x - b.x) * aspect, y: c.y - b.y };
  const len = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (len === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / len));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }, aspect = 1): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** The angle at the middle joint of a side's chain, or null. */
export function sideAngle(frame: PoseFrame, side: Side | null, chain: readonly [JointBase, JointBase, JointBase], minConfidence: number): number | null {
  if (!side) return null;
  const [a, b, c] = chain.map((j) => jointAt(frame, side, j, minConfidence));
  return a && b && c ? jointAngle(a, b, c, frame.aspect) : null;
}

/** How far `upper` is above `base`, measured in body lengths (`from`–`to` on the same side): no calibration needed. */
export function heightIn(frame: PoseFrame, side: Side | null, upper: JointBase, base: JointBase, unit: readonly [JointBase, JointBase], minConfidence: number): number | null {
  if (!side) return null;
  const u = jointAt(frame, side, upper, minConfidence);
  const b = jointAt(frame, side, base, minConfidence);
  const p = jointAt(frame, side, unit[0], minConfidence);
  const q = jointAt(frame, side, unit[1], minConfidence);
  if (!u || !b || !p || !q) return null;
  const length = distance(p, q, frame.aspect);
  return length > 0.01 ? (b.y - u.y) / length : null;
}

/* ---------- The engine ---------- */

type Ends = { endpoint: 'rest' | 'target' | 'between' | 'none'; depth: Record<string, number>; reachedNow: string[] };

function depthOf(path: EvidencePath, value: number): number {
  return (value - path.rest) / (path.target - path.rest);
}

/** Evidence from the paths that reached the target: per group, only its best reached path counts. */
function evidence(paths: readonly EvidencePath[], reachedIds: readonly string[]): number {
  const best = new Map<string, number>();
  for (const p of paths) if (reachedIds.includes(p.id)) best.set(p.group, Math.max(best.get(p.group) ?? 0, p.weight));
  return [...best.values()].reduce((n, w) => n + w, 0);
}

/**
 * Where the body is. The start position is judged by the PRIMARY paths
 * (weight 1) when any is measurable, otherwise by the paths of weight 0.5 or
 * more, so a supporting measure that depends on body proportions (e.g. torso
 * length) can never stop someone from being "back at the top".
 */
function ends(activity: CameraActivity, values: Record<string, number>, streak: Record<string, number> = {}): Ends {
  const depth: Record<string, number> = {};
  for (const p of activity.paths) if (values[p.id] !== undefined) depth[p.id] = depthOf(p, values[p.id]);
  const available = activity.paths.filter((p) => depth[p.id] !== undefined);
  const primary = available.filter((p) => p.weight >= 1);
  const judges = primary.length > 0 ? primary : available.filter((p) => p.weight >= 0.5);
  if (judges.length === 0) return { endpoint: 'none', depth, reachedNow: [] };
  const reachedNow = activity.paths.filter((p) => (depth[p.id] ?? 0) >= 1 || (streak[p.id] ?? 0) >= VERIFIER_DEFAULTS.rawFrames).map((p) => p.id);
  if (evidence(activity.paths, reachedNow) >= 1) return { endpoint: 'target', depth, reachedNow };
  if (judges.every((p) => depth[p.id] <= VERIFIER_DEFAULTS.restBand)) return { endpoint: 'rest', depth, reachedNow };
  return { endpoint: 'between', depth, reachedNow };
}

/** Average movement of the joints seen in both frames (share of the image). */
function motion(previous: PoseFrame['joints'] | null, frame: PoseFrame, minConfidence: number): number | null {
  if (!previous) return null;
  let total = 0;
  let n = 0;
  for (const [name, j] of Object.entries(frame.joints)) {
    const p = previous[name as JointName];
    if (!j || !p || j.c < minConfidence || p.c < minConfidence) continue;
    total += Math.hypot(j.x - p.x, j.y - p.y);
    n += 1;
  }
  return n > 0 ? total / n : null;
}

/** How long the body has been usable, ready and still (ms): the automatic start waits for ~1 s. */
export function steadyFor(state: VerifierState, now: number): number {
  return state.readiness === 'ready' && state.steadySince !== null ? Math.max(0, now - state.steadySince) : 0;
}

/** The hint of the most important path that hasn't reached the target. */
function moreHint(activity: CameraActivity, reached: readonly string[]): string | null {
  const missing = activity.paths.filter((p) => !reached.includes(p.id)).sort((a, b) => b.weight - a.weight);
  return missing[0]?.moreHint ?? null;
}

/** The hint of the most important path that isn't back at the start yet. */
function backHint(activity: CameraActivity, depth: Record<string, number>): string | null {
  const away = activity.paths
    .filter((p) => p.weight >= 0.5 && (depth[p.id] ?? 0) > VERIFIER_DEFAULTS.restBand)
    .sort((a, b) => b.weight - a.weight);
  return away[0]?.backHint ?? null;
}

function chooseSide(activity: CameraActivity, frame: PoseFrame, current: Side | null, mayChange: boolean): Side | null {
  if (activity.sides !== 'either') return null;
  const score = (side: Side) => {
    const joints = activity.sideJoints.map((j) => jointAt(frame, side, j, VERIFIER_DEFAULTS.minConfidence));
    return joints.every(Boolean) ? Math.min(...joints.map((j) => j!.c)) : -1;
  };
  const left = score('left');
  const right = score('right');
  if (current && score(current) >= 0 && !mayChange) return current;
  if (left < 0 && right < 0) return current;
  // Keep the current side unless the other one is clearly better (no flapping).
  if (current && score(current) >= 0 && Math.abs(left - right) < 0.15) return current;
  return left >= right ? 'left' : 'right';
}

/** Feeds one frame. */
export function stepVerifier(state: VerifierState, frame: PoseFrame, activity: CameraActivity): { state: VerifierState; event: VerifierEvent | null } {
  const d = VERIFIER_DEFAULTS;
  const gap = state.lastUsableAt !== null && frame.at - state.lastUsableAt > d.lostAfterMs;
  // Lost for too long: drop the rep in progress, keep the reps already counted.
  let s: VerifierState = gap
    ? {
        ...state,
        readiness: 'not_visible',
        usableFrames: 0,
        side: null,
        values: {},
        phase: 'unknown',
        home: null,
        homeAt: null,
        reached: [],
        progressAt: null,
        streak: {},
        glimpsed: [],
        steadySince: null,
        previous: null,
      }
    : state;

  if (!activity.usable(frame, d.minConfidence)) {
    return {
      state: {
        ...s,
        usableFrames: 0,
        readiness: s.readiness === 'ready' ? 'ready' : 'not_visible',
        steadySince: null,
        previous: null,
        hint: activity.positioningHint?.(frame, d.minConfidence) ?? null,
      },
      event: null,
    };
  }

  const usableFrames = s.usableFrames + 1;
  const readiness: Readiness = s.readiness === 'ready' || usableFrames >= d.readyFrames ? 'ready' : 'positioning';
  const side = chooseSide(activity, frame, s.side, s.phase === 'unknown' || s.phase === 'home');
  const values: Record<string, number> = {};
  const streak: Record<string, number> = {};
  const glimpsedNow: string[] = [];
  for (const p of activity.paths) {
    const v = p.measure(frame, side, d.minConfidence);
    if (v === null || !Number.isFinite(v)) continue;
    const previous = side === s.side ? s.values[p.id] : undefined;
    values[p.id] = previous === undefined ? v : previous + d.smoothing * (v - previous);
    if (depthOf(p, v) >= 1) {
      streak[p.id] = (side === s.side ? (s.streak[p.id] ?? 0) : 0) + 1;
      glimpsedNow.push(p.id);
    }
  }
  const moved = motion(s.previous, frame, d.minConfidence);
  const steadySince = moved !== null && moved <= d.steadyMotion ? (s.steadySince ?? frame.at) : moved === null ? s.steadySince : null;
  s = { ...s, usableFrames, readiness, lastUsableAt: frame.at, side, values, streak, steadySince, previous: frame.joints, hint: null };
  if (readiness !== 'ready') return { state: s, event: null };

  const { endpoint, reachedNow } = ends(activity, values, streak);
  if (endpoint === 'none') return { state: s, event: null };
  const at = frame.at;

  switch (s.phase) {
    case 'unknown':
      if (endpoint === 'rest' || (activity.eitherStart && endpoint === 'target')) {
        return { state: { ...s, phase: 'home', home: endpoint, homeAt: at, reached: [], progressAt: at }, event: null };
      }
      return { state: s, event: null };

    case 'home':
      if (endpoint === s.home) return { state: { ...s, homeAt: at }, event: null };
      return { state: { ...s, phase: 'leaving', reached: s.home === 'rest' ? reachedNow : [], glimpsed: glimpsedNow, progressAt: at }, event: null };

    case 'leaving':
    case 'away': {
      const reached = s.home === 'rest' ? [...new Set([...s.reached, ...reachedNow])] : s.reached;
      const glimpsed = [...new Set([...s.glimpsed, ...glimpsedNow])];
      const grew = reached.length > s.reached.length;
      const awayEnd = s.home === 'rest' ? 'target' : 'rest';
      const arrived = s.home === 'rest' ? evidence(activity.paths, reached) >= 1 : endpoint === 'rest';
      const progressAt = grew || endpoint === awayEnd ? at : s.progressAt;

      if (endpoint === s.home) {
        const base = { ...s, phase: 'home' as const, homeAt: at, reached: [], glimpsed: [], progressAt: at };
        const cycle = s.homeAt === null ? 0 : at - s.homeAt;
        // A detector glitch: ignore it without a message.
        if (cycle < d.glitchMs) return { state: base, event: null };
        if (s.phase === 'away') {
          if (cycle >= activity.minCycleMs) {
            return { state: { ...base, reps: s.reps + 1, last: { event: 'counted', at, hint: null } }, event: 'counted' };
          }
          return { state: { ...base, last: { event: 'too_fast', at, hint: SLOW_DOWN } }, event: 'too_fast' };
        }
        // The target was only glimpsed: a real movement, too quick to verify.
        if (s.home === 'rest' && evidence(activity.paths, glimpsed) >= 1) {
          return { state: { ...base, last: { event: 'too_fast', at, hint: SLOW_DOWN } }, event: 'too_fast' };
        }
        // Back without reaching the other end: a partial rep (not counted), and what was missing.
        const hint = s.home === 'rest' ? moreHint(activity, s.reached) : backHint(activity, depthsOf(activity, s.values));
        return { state: { ...base, last: { event: 'partial', at, hint } }, event: 'partial' };
      }
      return { state: { ...s, phase: s.phase === 'away' || arrived ? 'away' : 'leaving', reached, glimpsed, progressAt }, event: null };
    }
  }
}

function depthsOf(activity: CameraActivity, values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of activity.paths) if (values[p.id] !== undefined) out[p.id] = depthOf(p, values[p.id]);
  return out;
}

/** Plain, neutral guidance for right now ("Lower into the push-up", "Rep counted", "Straighten your arms"…). */
export function verifierFeedback(state: VerifierState, activity: CameraActivity, now: number): string {
  const d = VERIFIER_DEFAULTS;
  if (state.readiness === 'not_visible') return state.hint ?? activity.phrases.notVisible;
  if (state.readiness === 'positioning') return 'Hold there';
  if (state.last && now - state.last.at < d.messageMs) {
    if (state.last.event === 'counted') return 'Rep counted';
    if (state.last.hint) return state.last.hint;
  }
  const toAway = state.home === 'target' ? activity.phrases.toRest : activity.phrases.toTarget;
  const toHome = state.home === 'target' ? activity.phrases.toTarget : activity.phrases.toRest;
  switch (state.phase) {
    case 'unknown':
      return activity.phrases.start;
    case 'home':
      return toAway;
    case 'leaving':
      return 'Keep going';
    case 'away': {
      const stuck = state.progressAt !== null && now - state.progressAt > d.lingerMs;
      if (!stuck) return toHome;
      const depth = depthsOf(activity, state.values);
      return (state.home === 'target' ? moreHint(activity, ends(activity, state.values).reachedNow) : backHint(activity, depth)) ?? toHome;
    }
  }
}
