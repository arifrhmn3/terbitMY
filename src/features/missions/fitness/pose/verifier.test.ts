import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cancelCountdown, countdownLeft, createFitnessSession, fitnessPhase, recordCameraRep, startFitness } from '../session';
import { CAMERA_ACTIVITIES } from './camera-activities';
import { AUTO_START_STEADY_MS, autoStart } from './camera-flow';
import { FRAME_MS, hold, jack, legs, makeFrame, move, pushup, run } from './testing/pose-fixtures';
import { initialVerifier, jointAngle, SLOW_DOWN, steadyFor, stepVerifier, VERIFIER_DEFAULTS, verifierFeedback, type VerifierState } from './verifier';

const PUSH = CAMERA_ACTIVITIES.pushups;
const SQUAT = CAMERA_ACTIVITIES.squats;
const JACK = CAMERA_ACTIVITIES.jumping_jacks;
const SIT = CAMERA_ACTIVITIES.chair_sit_to_stand;

const ready = 12; // frames to settle and be "Ready"
const repeat = <T,>(n: number, make: () => T[]) => Array.from({ length: n }, make).flat();

/* Push-ups: elbow angle per frame. A normal recreational push-up bends the elbows to ~110–120°. */
const pushRep = (bottom = 110, down = 8, pause = 4) => [...move(170, bottom, down), ...hold(bottom, pause), ...move(bottom, 170, down), ...hold(170, 4)];
const pushups = (n: number, bottom = 110) => [...hold(170, ready), ...repeat(n, () => pushRep(bottom))];
/* Squats: knee angle per frame. */
const squatRep = (bottom = 95) => [...move(175, bottom, 9), ...hold(bottom, 4), ...move(bottom, 175, 9), ...hold(175, 4)];
const squats = (n: number, bottom = 95) => [...hold(175, ready), ...repeat(n, () => squatRep(bottom))];
/* Jumping jacks: [arms, spread] per frame. */
const jackRep = (arms = 1, spread = 1): [number, number][] => [
  ...move(0, 1, 3).map((t): [number, number] => [t * arms, t * spread]),
  ...hold<[number, number]>([arms, spread], 1),
  ...move(1, 0, 3).map((t): [number, number] => [t * arms, t * spread]),
  ...hold<[number, number]>([0, 0], 2),
];
const jacks = (n: number, arms = 1, spread = 1) => [...hold<[number, number]>([0, 0], ready), ...repeat(n, () => jackRep(arms, spread))];
/* Sit-to-stand: knee angle per frame (shin nearly upright when seated). */
const sitPose = (k: number) => legs(k, { shinShare: 0.1 });
const sitStand = (start: 'seated' | 'standing', n: number, standKnee = 170, frames = 12) => {
  const [a, b] = start === 'seated' ? [90, standKnee] : [standKnee, 90];
  return [...hold(a, ready), ...repeat(n, () => [...move(a, b, frames), ...hold(b, 6), ...move(b, a, frames), ...hold(a, 6)])];
};

describe('shared engine', () => {
  it('angles in real proportions (portrait images are corrected)', () => {
    expect(jointAngle({ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
    expect(jointAngle({ x: 0, y: -0.75 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 0.75)).toBeCloseTo(90);
  });

  it('“Ready” needs only the joints the movement needs (one arm for push-ups), for a moment', () => {
    expect(run(PUSH, hold(170, ready), (e) => pushup(e), { frame: { hide: ['leftHip', 'leftKnee', 'leftAnkle'] } }).state.readiness).toBe('ready');
    expect(run(PUSH, hold(170, VERIFIER_DEFAULTS.readyFrames - 1), (e) => pushup(e)).state.readiness).toBe('positioning');
  });

  it('completed reps are never lost when the body disappears; the rep in progress is dropped; counting resumes', () => {
    const three = run(PUSH, pushups(3), (e) => pushup(e));
    expect(three.state.reps).toBe(3);
    const halfway = run(PUSH, move(170, 100, 8), (e) => pushup(e), { start: three.state, from: three.at });
    // Gone for 2 s (out of frame / app in the background), back already at the top: no phantom rep.
    const back = run(PUSH, hold(170, ready), (e) => pushup(e), { start: halfway.state, from: halfway.at + 2000 });
    expect(back.state.reps).toBe(3);
    expect(back.events).toEqual([]);
    expect(run(PUSH, pushRep(), (e) => pushup(e), { start: back.state, from: back.at }).state.reps).toBe(4);
  });

  it('a brief dropout (shorter than the loss limit) doesn’t interrupt the rep', () => {
    const r = run(PUSH, pushups(1), (e) => pushup(e), { frame: (i) => (i === ready + 10 || i === ready + 11 ? { hide: ['leftElbow', 'leftHip'] } : {}) });
    expect(r.state.reps).toBe(1);
  });

  it('keeps one side for the whole rep even when confidence flickers between sides', () => {
    const r = run(PUSH, pushups(2), (e) => pushup(e, { yaw: 0 }), { frame: (i) => ({ sideC: i % 2 ? { left: 0.8, right: 0.85 } : { left: 0.85, right: 0.8 } }) });
    expect(new Set(r.states.filter((s) => s.side).map((s) => s.side)).size).toBe(1);
    expect(r.state.reps).toBe(2);
  });

  it('feedback is neutral and actionable, never “bad form” or “incorrect”', () => {
    const text = JSON.stringify(Object.values(CAMERA_ACTIVITIES).map((a) => ({ p: a.phrases, pos: a.positioning, h: a.paths.map((x) => [x.moreHint, x.backHint]) })));
    expect(text).not.toMatch(/bad|incorrect|wrong|fail/i);
    expect(SLOW_DOWN).toBe('A little slower so I can count the full movement');
  });
});

describe('push-ups: lenient depth, any camera angle', () => {
  it('a NORMAL recreational push-up (elbows ~110–120°) counts; the chest needn’t approach the floor', () => {
    expect(run(PUSH, pushups(10, 115), (e) => pushup(e)).state.reps).toBe(10);
    expect(run(PUSH, pushups(10, 110), (e) => pushup(e)).state.reps).toBe(10);
  });

  it('a very deep push-up counts too', () => {
    expect(run(PUSH, pushups(5, 70), (e) => pushup(e)).state.reps).toBe(5);
  });

  it('a genuinely shallow push-up doesn’t count, and says “Lower a little more”', () => {
    const r = run(PUSH, pushups(1, 135), (e) => pushup(e));
    expect(r.state.reps).toBe(0);
    expect(r.state.last).toMatchObject({ event: 'partial', hint: 'Lower a little more' });
    expect(verifierFeedback(r.state, PUSH, r.at)).toBe('Lower a little more');
  });

  it('works front-facing (12 o’clock), left side, right side and angled, with no mode to choose', () => {
    for (const yaw of [0, 90, -90, 45, -30]) {
      expect({ yaw, reps: run(PUSH, pushups(10, 115), (e) => pushup(e, { yaw })).state.reps }).toEqual({ yaw, reps: 10 });
      expect({ yaw, shallow: run(PUSH, pushups(3, 135), (e) => pushup(e, { yaw })).state.reps }).toEqual({ yaw, shallow: 0 });
    }
  });

  it('front-facing: the elbow angle hardly changes, so shoulder lowering (in forearm lengths) carries it', () => {
    const r = run(PUSH, pushups(1, 115), (e) => pushup(e, { yaw: 0 }));
    expect(Math.min(...r.states.map((s) => s.values.elbow ?? 180))).toBeGreaterThan(160);
    expect(r.state.reps).toBe(1);
  });

  it('tiny bends, bouncing at the top, and jitter never count', () => {
    expect(run(PUSH, [...hold(170, ready), ...repeat(10, () => [...move(170, 150, 3), ...move(150, 170, 3)])], (e) => pushup(e)).state.reps).toBe(0);
    expect(run(PUSH, [...hold(170, ready), ...Array.from({ length: 120 }, (_, i) => (i % 2 ? 140 : 156))], (e) => pushup(e)).state.reps).toBe(0);
    expect(run(PUSH, hold(170, 200), (e) => pushup(e)).state.reps).toBe(0);
  });

  it('staying down counts once (after coming up)', () => {
    const down = run(PUSH, [...hold(170, ready), ...move(170, 100, 8), ...hold(100, 60)], (e) => pushup(e));
    expect(down.state.reps).toBe(0);
    expect(run(PUSH, [...move(100, 170, 8), ...hold(170, 10)], (e) => pushup(e), { start: down.state, from: down.at }).state.reps).toBe(1);
  });

  it('elbow hidden (side-on): shoulder AND hip lowering still verify a full push-up; shoulders dipping alone never do', () => {
    expect(run(PUSH, pushups(3, 90), (e) => pushup(e), { frame: { hide: ['leftElbow'] } }).state.reps).toBe(3);
    const dip = run(PUSH, pushups(3, 90), (e) => pushup(e, { shoulderOnly: true }), { frame: { hide: ['leftElbow'] } });
    expect(dip.state.reps).toBe(0);
  });

  it('nothing before “Ready”; never from a mid-rep start; low confidence counts nothing', () => {
    expect(run(PUSH, [...move(170, 100, 3), ...move(100, 170, 3)], (e) => pushup(e)).state.reps).toBe(0);
    expect(run(PUSH, [...hold(100, ready), ...move(100, 170, 8), ...hold(170, 6)], (e) => pushup(e)).state.reps).toBe(0);
    expect(run(PUSH, pushups(3), (e) => pushup(e), { frame: { c: 0.2 } }).state).toMatchObject({ reps: 0, readiness: 'not_visible' });
  });
});

describe('squats (front-facing worked best; side and angled too)', () => {
  it('valid reps count: front-facing, side-on (either side), moderate depth', () => {
    expect(run(SQUAT, squats(10, 90), (k) => legs(k, { front: true })).state.reps).toBe(10);
    expect(run(SQUAT, squats(10), (k) => legs(k)).state.reps).toBe(10);
    expect(run(SQUAT, squats(4), (k) => legs(k, { side: 'right' })).state.reps).toBe(4);
    expect(run(SQUAT, squats(3, 115), (k) => legs(k)).state.reps).toBe(3);
  });

  it('front-facing with the shoulders out of frame: hips + knee bend still verify it', () => {
    expect(run(SQUAT, squats(3, 90), (k) => legs(k, { front: true }), { frame: { hide: ['leftShoulder', 'rightShoulder'] } }).state.reps).toBe(3);
  });

  it('a shallow knee bend doesn’t count (“A little lower”); leaning forward and bouncing never count', () => {
    const r = run(SQUAT, [...hold(175, ready), ...move(175, 140, 8), ...hold(140, 4), ...move(140, 175, 8), ...hold(175, 6)], (k) => legs(k));
    expect(r.state).toMatchObject({ reps: 0, last: { event: 'partial', hint: 'A little lower' } });
    const lean = run(SQUAT, [...hold(0, ready), ...repeat(5, () => [...move(0, 60, 8), ...move(60, 0, 8)])], (l) => legs(175, { lean: l }));
    expect(lean.state.reps).toBe(0);
    expect(lean.events).toEqual([]);
    expect(run(SQUAT, [...hold(175, ready), ...repeat(10, () => [...move(175, 160, 2), ...move(160, 175, 2)])], (k) => legs(k)).state.reps).toBe(0);
  });
});

describe('jumping jacks (front-facing; arms AND legs)', () => {
  const pose = ([a, s]: [number, number]) => jack(a, s);

  it('valid reps count, including a brisk ~0.6 s pace', () => {
    expect(run(JACK, jacks(15), pose).state.reps).toBe(15);
  });

  it('arms only or legs only never count; the hint says what’s missing', () => {
    expect(run(JACK, jacks(3, 1, 0), pose).state).toMatchObject({ reps: 0, last: { hint: 'Jump your feet a little wider' } });
    expect(run(JACK, jacks(3, 0, 1), pose).state).toMatchObject({ reps: 0, last: { hint: 'Raise your arms a little higher' } });
  });

  it('feet out of frame: the knees spreading with the arms still count; camera shake never counts', () => {
    expect(run(JACK, jacks(5), pose, { frame: { hide: ['leftAnkle', 'rightAnkle'] } }).state.reps).toBe(5);
    expect(run(JACK, hold<[number, number]>([0, 0], 200), pose, { frame: { shake: 0.015 } }).state.reps).toBe(0);
  });
});

describe('chair sit-to-stand (forgiving; starts seated or standing)', () => {
  it('counts from either start, and a ~150° stand is enough', () => {
    expect(run(SIT, sitStand('seated', 1), sitPose).state).toMatchObject({ reps: 1, home: 'target' });
    expect(run(SIT, sitStand('standing', 3), sitPose).state).toMatchObject({ reps: 3, home: 'rest' });
    expect(run(SIT, sitStand('seated', 3, 150), sitPose).state.reps).toBe(3);
  });

  it('a half stand doesn’t count (“Stand all the way up”); leaning forward never counts', () => {
    const r = run(SIT, [...hold(90, ready), ...move(90, 128, 10), ...hold(128, 4), ...move(128, 90, 10), ...hold(90, 6)], sitPose);
    expect(r.state).toMatchObject({ reps: 0, last: { event: 'partial', hint: 'Stand all the way up' } });
    expect(run(SIT, [...hold(0, ready), ...repeat(4, () => [...move(0, 40, 8), ...move(40, 0, 8)])], (l) => legs(90, { shinShare: 0.1, lean: l })).state.reps).toBe(0);
  });
});

/**
 * SPEED, for every camera activity: a glitch-fast cycle is ignored silently;
 * a plausible-but-too-quick movement says "A little slower so I can count the
 * full movement"; normal fast and normal slow movements count.
 */
describe('speed: glitches ignored, too-quick movements get a slow-down prompt, natural pace counts', () => {
  const cases = [
    {
      name: 'push-ups',
      activity: PUSH,
      pose: (e: number) => pushup(e),
      glitch: [...hold(170, ready), 40, ...hold(170, 20)],
      quick: { frames: [...hold(170, ready), ...hold(100, 3), ...hold(170, 8)], stepMs: 55 },
      fast: [...hold(170, ready), ...repeat(5, () => [...move(170, 110, 5), ...move(110, 170, 5), ...hold(170, 2)])],
      slow: [...hold(170, ready), ...repeat(3, () => [...move(170, 110, 25), ...hold(110, 10), ...move(110, 170, 25), ...hold(170, 5)])],
      fastReps: 5,
      slowReps: 3,
    },
    {
      name: 'squats',
      activity: SQUAT,
      pose: (k: number) => legs(k),
      glitch: [...hold(175, ready), 60, ...hold(175, 20)],
      quick: { frames: [...hold(175, ready), ...hold(95, 3), ...hold(175, 8)], stepMs: 55 },
      fast: [...hold(175, ready), ...repeat(5, () => [...move(175, 100, 6), ...move(100, 175, 6), ...hold(175, 2)])],
      slow: [...hold(175, ready), ...repeat(3, () => [...move(175, 95, 25), ...hold(95, 10), ...move(95, 175, 25), ...hold(175, 5)])],
      fastReps: 5,
      slowReps: 3,
    },
    {
      name: 'chair sit-to-stand',
      activity: SIT,
      pose: sitPose,
      glitch: [...hold(90, ready), 175, ...hold(90, 20)],
      quick: { frames: [...hold(90, ready), ...move(90, 170, 3), ...hold(170, 2), ...move(170, 90, 3), ...hold(90, 8)], stepMs: 60 },
      fast: sitStand('seated', 3, 170, 7), // ~1.3 s a cycle
      slow: sitStand('seated', 2, 170, 40), // ~6 s a cycle
      fastReps: 3,
      slowReps: 2,
    },
  ] as const;

  for (const c of cases) {
    it(`${c.name}: glitch silent; too quick → slow-down prompt; fast and slow count`, () => {
      const glitch = run(c.activity, c.glitch, c.pose as (p: number) => ReturnType<typeof legs>);
      expect(glitch.state.reps).toBe(0);
      expect(glitch.events).toEqual([]);
      const quick = run(c.activity, c.quick.frames, c.pose as (p: number) => ReturnType<typeof legs>, { stepMs: c.quick.stepMs });
      expect(quick.state.reps).toBe(0);
      expect(quick.events).toContain('too_fast');
      expect(verifierFeedback(quick.state, c.activity, quick.at)).toBe(SLOW_DOWN);
      expect(run(c.activity, c.fast, c.pose as (p: number) => ReturnType<typeof legs>).state.reps).toBe(c.fastReps);
      expect(run(c.activity, c.slow, c.pose as (p: number) => ReturnType<typeof legs>).state.reps).toBe(c.slowReps);
    });
  }

  it('jumping jacks: glitch silent; a snapped half-second-too-quick jack → slow-down prompt; brisk and slow jacks count', () => {
    const pose = ([a, s]: [number, number]) => jack(a, s);
    const glitch = run(JACK, [...hold<[number, number]>([0, 0], ready), [1, 1], ...hold<[number, number]>([0, 0], 20)], pose);
    expect(glitch).toMatchObject({ events: [], state: { reps: 0 } });
    const quick = run(JACK, [...hold<[number, number]>([0, 0], ready), [1, 1], [1, 1], ...hold<[number, number]>([0, 0], 8)], pose, { stepMs: 55 });
    expect(quick.state.reps).toBe(0);
    expect(quick.events).toContain('too_fast');
    expect(verifierFeedback(quick.state, JACK, quick.at)).toBe(SLOW_DOWN);
    expect(run(JACK, jacks(10), pose).state.reps).toBe(10);
    const slow = [...hold<[number, number]>([0, 0], ready), ...repeat(3, () => [...move(0, 1, 12).map((t): [number, number] => [t, t]), ...move(1, 0, 12).map((t): [number, number] => [t, t]), ...hold<[number, number]>([0, 0], 4)])];
    expect(run(JACK, slow, pose).state.reps).toBe(3);
  });
});

describe('automatic start (no tap; nobody walks back to the phone)', () => {
  const still = (frames: number, start?: VerifierState, from?: number) => run(SQUAT, hold(175, frames), (k) => legs(k, { front: true }), { start, from });

  it('a valid pose held still for ~1 s starts the countdown; a brief one doesn’t', () => {
    const brief = still(12); // ~0.8 s visible, less held still
    expect(autoStart(brief.state, 'ready', brief.at)).toBeNull();
    const held = still(Math.ceil(AUTO_START_STEADY_MS / FRAME_MS) + 3);
    expect(steadyFor(held.state, held.at)).toBeGreaterThanOrEqual(AUTO_START_STEADY_MS);
    expect(autoStart(held.state, 'ready', held.at)).toBe('start');
  });

  it('moving around (walking into place, warming up) doesn’t start it', () => {
    const walking = run(SQUAT, hold(175, 30), (k) => legs(k, { front: true }), { frame: { shake: 0.06 } });
    expect(autoStart(walking.state, 'ready', walking.at)).toBeNull();
  });

  it('losing the pose during the countdown cancels it (back to positioning); after Go, nothing cancels', () => {
    const held = still(30);
    const gone = run(SQUAT, hold(175, 15), (k) => legs(k), { start: held.state, from: held.at, frame: { hide: ['leftAnkle', 'rightAnkle'] } });
    expect(gone.state.readiness).toBe('not_visible');
    expect(autoStart(gone.state, 'countdown', gone.at)).toBe('cancel');
    expect(autoStart(gone.state, 'active', gone.at)).toBeNull();
    expect(verifierFeedback(gone.state, SQUAT, gone.at)).toBe('Step back a little — keep your feet in frame');
  });

  it('the countdown runs 3 → 2 → 1, then counting starts; reps before Go don’t count; cancelling resets', () => {
    let s = startFitness(createFitnessSession({ exercise: 'squats', difficulty: 'easy' }, 1), 0);
    expect([countdownLeft(s, 0), countdownLeft(s, 1100), countdownLeft(s, 2100)]).toEqual([3, 2, 1]);
    expect(recordCameraRep(s, 2500, 350).outcome).toBe('not_active');
    expect(fitnessPhase(s, 3000)).toBe('active');
    expect(recordCameraRep(s, 3500, 350).outcome).toBe('counted');
    s = cancelCountdown(s, 1000);
    expect(fitnessPhase(s, 1000)).toBe('ready');
  });

  it('the camera screen has no Start button to press', () => {
    const view = readFileSync(join(__dirname, '..', 'camera-verification-view.tsx'), 'utf8');
    expect(view).not.toMatch(/title=\{?["'`]Start|Waiting for you to be in view/);
    expect(view).toContain('autoStart(');
  });
});

describe('positioning guidance (one clear action at a time)', () => {
  it('says what to fix', () => {
    expect(verifierFeedback(run(SQUAT, hold(175, 20), (k) => legs(k, { front: true }), { frame: { hide: ['leftAnkle', 'rightAnkle'] } }).state, SQUAT, 0)).toBe(
      'Step back a little — keep your feet in frame',
    );
    expect(verifierFeedback(run(PUSH, hold(170, 20), (e) => pushup(e), { frame: { hide: ['leftWrist'] } }).state, PUSH, 0)).toBe('Keep one arm visible');
    expect(verifierFeedback(run(JACK, hold<[number, number]>([0, 0], 20), ([a, s]) => jack(a, s), { frame: { hide: ['leftWrist', 'rightWrist'] } }).state, JACK, 0)).toBe(
      'Keep your arms in frame',
    );
    expect(verifierFeedback(run(PUSH, hold(170, 20), (e) => pushup(e), { frame: { c: 0.1 } }).state, PUSH, 0)).toBe('Move into view');
  });

  it('positioning recommends what worked on the iPhone', () => {
    expect(PUSH.positioning).toMatch(/Front-facing or side-on both work/);
    expect(SQUAT.positioning).toMatch(/Face the phone or turn slightly sideways/);
    expect(JACK.positioning).toMatch(/^Face the phone/);
    expect(SIT.positioning).toMatch(/Side-on or slightly angled/);
  });

  it('live feedback sequence: Hold there → go → keep going → back → Rep counted', () => {
    const settling = run(PUSH, hold(170, 3), (e) => pushup(e));
    expect(verifierFeedback(settling.state, PUSH, settling.at)).toBe('Hold there');
    const home = run(PUSH, hold(170, ready), (e) => pushup(e));
    expect(verifierFeedback(home.state, PUSH, home.at)).toBe('Lower into the push-up');
    const going = run(PUSH, move(170, 135, 4), (e) => pushup(e), { start: home.state, from: home.at });
    expect(verifierFeedback(going.state, PUSH, going.at)).toBe('Keep going');
    const bottom = run(PUSH, [...move(135, 105, 4), ...hold(105, 2)], (e) => pushup(e), { start: going.state, from: going.at });
    expect(verifierFeedback(bottom.state, PUSH, bottom.at)).toBe('Good — push back up');
    const up = run(PUSH, move(105, 170, 6), (e) => pushup(e), { start: bottom.state, from: bottom.at });
    expect(verifierFeedback(up.state, PUSH, up.at)).toBe('Rep counted');
  });
});

describe('performance (native analysis rate)', () => {
  it('analyses about 15 frames a second, small frames, dropping late ones', () => {
    const swift = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'modules', 'terbit-pose', 'ios', 'PoseCameraView.swift'), 'utf8');
    expect(swift).toContain('private let interval: CFTimeInterval = 1.0 / 15.0');
    expect(swift).toContain('.vga640x480');
    expect(swift).toContain('output.alwaysDiscardsLateVideoFrames = true');
  });

  it('a frame step is far cheaper than a frame interval', () => {
    let s = initialVerifier;
    const started = Date.now();
    for (let i = 0; i < 3000; i++) s = stepVerifier(s, makeFrame(i * FRAME_MS, jack(i % 20 < 10 ? 1 : 0, i % 20 < 10 ? 1 : 0)), JACK).state;
    expect((Date.now() - started) / 3000).toBeLessThan(1);
  });
});
