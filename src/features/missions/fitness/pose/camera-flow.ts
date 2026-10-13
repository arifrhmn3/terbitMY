import type { CameraPermission } from '@/services/pose';

import type { FitnessExercise } from '../types';

import { isCameraVerifiable } from './camera-activities';
import { steadyFor, type VerifierState } from './verifier';

/**
 * "Verify with camera": what to show, as pure rules. The camera is always
 * optional; every step offers "Continue without camera" (the normal tap
 * counting), so nobody is ever blocked by permission, lighting, position or
 * the device.
 *
 *   explain (first time, or the status couldn't be read) ─Allow─► iOS prompt ─► camera
 *   denied: how to turn it on in iPhone Settings (never asks again)
 *   unavailable: not in this build, or no camera on this device
 *   camera ─error─► error
 */
export type CameraStep = 'checking' | 'explain' | 'denied' | 'unavailable' | 'camera' | 'error';

/** Offered only for camera-verifiable activities (`CAMERA_ACTIVITIES`), and only in a build with the camera module. */
export function canVerifyWithCamera(exercise: FitnessExercise, cameraInBuild: boolean): boolean {
  return cameraInBuild && isCameraVerifiable(exercise);
}

export function cameraStep(permission: CameraPermission | null): CameraStep {
  switch (permission) {
    case null:
      return 'checking';
    case 'undetermined':
    case 'unknown':
      // Not asked yet (or the check failed): explain, then let iOS decide.
      return 'explain';
    case 'granted':
      return 'camera';
    case 'denied':
      return 'denied';
    case 'not_in_build':
    case 'no_camera':
      return 'unavailable';
  }
}

export const CAMERA_COPY = {
  offer: 'Optional: let the camera count your reps on this phone.',
  explainTitle: 'Count reps with the camera?',
  explain: 'Terbit uses the camera to count exercise repetitions on your device. Video is not recorded or uploaded.',
  deniedTitle: 'Camera access is off',
  denied: 'You can keep tapping after each rep instead. To use the camera later: iPhone Settings → Terbit MY → Camera.',
  unavailableTitle: 'Camera counting isn’t available here',
  unavailable: 'This phone or version of Terbit MY can’t count reps with the camera. Tap after each rep instead.',
  errorTitle: 'The camera stopped',
  error: 'Another app or a call may be using the camera. Try again, or continue without the camera.',
  privacy: 'Counted on this phone. Video isn’t recorded, saved or uploaded.',
  fallback: 'Continue without camera',
} as const;

/**
 * AUTOMATIC START (no tap, so nobody walks back to the phone): once the
 * activity's pose has been usable and still for `AUTO_START_STEADY_MS`, the
 * mission's normal countdown starts by itself (Ready · 3 → 2 → 1 → Go).
 * Losing the pose during the countdown cancels it (back to positioning).
 * After Go, normal movement never cancels anything.
 */
export const AUTO_START_STEADY_MS = 1000;
/** How long "Go" shows after the countdown. */
export const GO_MS = 900;

export type AutoStart = 'start' | 'cancel' | null;

export function autoStart(verifier: VerifierState, mission: 'ready' | 'countdown' | 'active' | 'done', now: number): AutoStart {
  if (mission === 'ready' && steadyFor(verifier, now) >= AUTO_START_STEADY_MS) return 'start';
  if (mission === 'countdown' && verifier.readiness !== 'ready') return 'cancel';
  return null;
}

