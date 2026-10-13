import type { JointName, PoseFrame } from '../types';
import { initialVerifier, stepVerifier, type CameraActivity, type VerifierEvent, type VerifierState } from '../verifier';

/**
 * TEST ONLY: synthetic pose sequences built from simple body geometry
 * (segment lengths and joint angles), so the frames are physically
 * consistent, like Apple Vision's output. Coordinates are 0–1, top-left origin.
 */

type P = { x: number; y: number };
type Joints = Partial<Record<JointName, P>>;

export const FRAME_MS = 66; // ~15 analysed frames a second, like the native side

const rad = (deg: number) => (deg * Math.PI) / 180;

export type FrameOptions = {
  /** Confidence of every joint (default 0.9). */
  c?: number;
  /** Joints missing from this frame. */
  hide?: readonly JointName[];
  /** Random camera shake added to every joint (max offset). */
  shake?: number;
  /** Confidence per body side (overrides `c` for that side's joints). */
  sideC?: { left?: number; right?: number };
};

export function makeFrame(at: number, joints: Joints, o: FrameOptions = {}): PoseFrame {
  const out: PoseFrame['joints'] = {};
  for (const [name, p] of Object.entries(joints) as [JointName, P][]) {
    if (o.hide?.includes(name)) continue;
    const jitter = () => (o.shake ? (Math.random() * 2 - 1) * o.shake : 0);
    const sideC = name.startsWith('left') ? o.sideC?.left : o.sideC?.right;
    out[name] = { x: p.x + jitter(), y: p.y + jitter(), c: sideC ?? o.c ?? 0.9 };
  }
  return { at, aspect: 1, joints: out };
}

/** Prefix side-relative joints ("Shoulder" → "leftShoulder"). */
function sided(side: 'left' | 'right', joints: Record<string, P>): Joints {
  return Object.fromEntries(Object.entries(joints).map(([k, v]) => [`${side}${k}`, v])) as Joints;
}

/**
 * Push-up as a small 3D body (hands on the floor, forearms upright, body a
 * straight line to the feet), seen by a camera at `yaw` degrees around the
 * user: 90 = from the left side (3 o'clock for the user's left), -90 = from
 * the right side, 0 = from the front (12 o'clock, facing the head), 45 = angled.
 * The far side is hidden when the camera is side-on.
 * `shoulderOnly`: the shoulders dip but the hips stay up (not a push-up).
 */
export function pushup(elbow: number, o: { yaw?: number; side?: 'left' | 'right'; shoulderOnly?: boolean } = {}): Joints {
  const yaw = o.yaw ?? (o.side === 'right' ? -90 : 90);
  const L = 0.15;
  const floor = 0.8;
  const project = (p: { lat: number; y: number; z: number }) => ({
    x: 0.5 + p.lat * Math.cos(rad(yaw)) + p.z * Math.sin(rad(yaw)),
    y: p.y,
  });
  const out: Joints = {};
  for (const [side, dir] of [['left', -1], ['right', 1]] as const) {
    // Side-on, the far side is hidden behind the body.
    const near = Math.abs(yaw) < 60 || (yaw > 0 ? side === 'left' : side === 'right');
    if (!near) continue;
    const wrist = { lat: dir * 0.12, y: floor, z: 0 };
    const el = { lat: dir * 0.12, y: floor - L, z: 0 };
    const shoulderAt = (angle: number) => ({ lat: dir * 0.1, y: el.y + L * Math.cos(rad(angle)), z: L * Math.sin(rad(angle)) });
    const shoulder = shoulderAt(elbow);
    const top = o.shoulderOnly ? shoulderAt(170) : shoulder;
    const feet = { lat: dir * 0.05, y: floor, z: top.z - 0.55 };
    const hip = { lat: dir * 0.08, y: top.y + 0.5 * (feet.y - top.y), z: top.z + 0.5 * (feet.z - top.z) };
    const knee = { lat: dir * 0.06, y: (hip.y + feet.y) / 2, z: (hip.z + feet.z) / 2 };
    Object.assign(out, sided(side, { Shoulder: project(shoulder), Elbow: project(el), Wrist: project(wrist), Hip: project(hip), Knee: project(knee), Ankle: project(feet) }));
  }
  return out;
}

/**
 * Squat or sit-to-stand, side-on (or `front`: facing the phone, knees
 * splaying out a little). `shinShare`: how much of the bend the shin leans
 * forward (squat ~0.35, sitting down ~0.1). `lean`: extra forward torso lean.
 */
export function legs(knee: number, o: { side?: 'left' | 'right'; front?: boolean; shinShare?: number; lean?: number } = {}): Joints {
  const bend = 180 - knee;
  const beta = bend * (o.shinShare ?? 0.35);
  const gamma = bend - beta;
  const delta = bend * 0.3 + (o.lean ?? 0);
  const Ls = 0.2;
  const Lt = 0.2;
  const T = 0.3;
  const ankle = { x: 0.5, y: 0.9 };
  if (o.front) {
    // Facing the phone: forward/back movement is invisible; only heights and the knees splaying out show.
    const splay = (0.06 * bend) / 90;
    const make = (dir: -1 | 1) => {
      const a = { x: 0.5 + dir * 0.05, y: ankle.y };
      const k = { x: a.x + dir * splay, y: a.y - Ls * Math.cos(rad(beta)) };
      const h = { x: a.x, y: k.y - Lt * Math.cos(rad(gamma)) };
      const s = { x: a.x + dir * 0.02, y: h.y - T * Math.cos(rad(delta)) };
      return { Ankle: a, Knee: k, Hip: h, Shoulder: s, Wrist: { x: s.x + dir * 0.05, y: s.y + 0.2 }, Elbow: { x: s.x + dir * 0.04, y: s.y + 0.1 } };
    };
    return { ...sided('left', make(-1)), ...sided('right', make(1)) };
  }
  const k = { x: ankle.x + Ls * Math.sin(rad(beta)), y: ankle.y - Ls * Math.cos(rad(beta)) };
  const h = { x: k.x - Lt * Math.sin(rad(gamma)), y: k.y - Lt * Math.cos(rad(gamma)) };
  const s = { x: h.x + T * Math.sin(rad(delta)), y: h.y - T * Math.cos(rad(delta)) };
  return sided(o.side ?? 'left', { Ankle: ankle, Knee: k, Hip: h, Shoulder: s, Elbow: { x: s.x + 0.05, y: s.y + 0.12 }, Wrist: { x: s.x + 0.1, y: s.y + 0.2 } });
}

/** Jumping jack, facing the phone. `arms` and `spread` from 0 (closed) to 1 (open). */
export function jack(arms: number, spread: number): Joints {
  const make = (dir: -1 | 1) => {
    const s = { x: 0.5 + dir * 0.05, y: 0.35 };
    const h = { x: 0.5 + dir * 0.04, y: 0.6 };
    const phi = 10 + arms * 150;
    const w = { x: s.x + dir * 0.25 * Math.sin(rad(phi)), y: s.y + 0.25 * Math.cos(rad(phi)) };
    const e = { x: (s.x + w.x) / 2, y: (s.y + w.y) / 2 };
    return { Shoulder: s, Elbow: e, Wrist: w, Hip: h, Knee: { x: 0.5 + dir * (0.04 + spread * 0.06), y: 0.75 }, Ankle: { x: 0.5 + dir * (0.04 + spread * 0.12), y: 0.9 } };
  };
  return { ...sided('left', make(-1)), ...sided('right', make(1)) };
}

/** A value held for `frames` frames. */
export const hold = <T,>(value: T, frames: number): T[] => Array.from({ length: frames }, () => value);
/** A smooth number change over `frames` frames. */
export const move = (from: number, to: number, frames: number): number[] => Array.from({ length: frames }, (_, i) => from + ((to - from) * (i + 1)) / frames);

export type RunResult = { state: VerifierState; events: VerifierEvent[]; at: number; states: VerifierState[] };

/** Feeds one pose per frame (built by `pose`) to the verifier. */
export function run<T>(
  activity: CameraActivity,
  params: readonly T[],
  pose: (p: T) => Joints,
  opts: { from?: number; start?: VerifierState; stepMs?: number; frame?: FrameOptions | ((i: number) => FrameOptions) } = {},
): RunResult {
  let state = opts.start ?? initialVerifier;
  let at = opts.from ?? 1_000_000;
  const events: VerifierEvent[] = [];
  const states: VerifierState[] = [];
  params.forEach((p, i) => {
    const o = typeof opts.frame === 'function' ? opts.frame(i) : opts.frame;
    const out = stepVerifier(state, makeFrame(at, pose(p), o), activity);
    state = out.state;
    states.push(state);
    if (out.event) events.push(out.event);
    at += opts.stepMs ?? FRAME_MS;
  });
  return { state, events, at, states };
}
