import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import {
  TerbitPose,
  TerbitPoseCameraView,
  type NativeCameraPermission,
  type TerbitPoseCameraViewProps,
  type TerbitPoseNativeModule,
} from '../../../modules/terbit-pose';

/**
 * Camera rep counting (Phase 4.5): the only way the app reaches the camera
 * and Apple Vision. Everything runs on the phone: frames are analysed in
 * memory and dropped, only joint positions come back, and nothing is
 * recorded, saved or uploaded. No account or internet needed.
 *
 * Three separate questions (never merged into one "unavailable"):
 * - module: is camera counting in this build? (no on Android, the web
 *   preview, Expo Go and builds made before Phase 4.5);
 * - hardware: does this phone have a camera? (null: the check failed, which
 *   is NOT treated as "no camera");
 * - permission: what iOS reports (null: couldn't be read).
 */
export type CameraAvailability = {
  module: boolean;
  hardware: boolean | null;
  permission: 'granted' | 'denied' | 'undetermined' | null;
  /** Technical detail, for developer diagnostics only (never shown to users). */
  errors: string[];
};

/**
 * What the app does with it:
 * - not_in_build / no_camera: camera counting can't be offered;
 * - undetermined: iOS hasn't asked yet ("Not asked yet", never "unavailable");
 * - unknown: a check failed; the app can still try asking.
 */
export type CameraPermission = 'granted' | 'denied' | 'undetermined' | 'not_in_build' | 'no_camera' | 'unknown';

export type { NativeCameraErrorEvent as CameraErrorEvent, NativePoseEvent as PoseEvent } from '../../../modules/terbit-pose';

export interface PoseCameraService {
  /** Camera counting is in this build (the native module and its view exist). */
  available: boolean;
  /** Reads everything; never asks. */
  getAvailability(): Promise<CameraAvailability>;
  /** Asks iOS only if it never has (called only after the user taps "Verify with camera"). */
  requestPermission(): Promise<CameraAvailability>;
  CameraView: ComponentType<TerbitPoseCameraViewProps> | null;
}

/** iOS "restricted" counts as denied; anything unexpected is unreadable (null). */
export function mapNativePermission(status: NativeCameraPermission | string): CameraAvailability['permission'] {
  if (status === 'granted' || status === 'undetermined') return status;
  if (status === 'denied' || status === 'restricted') return 'denied';
  return null;
}

/** The single answer screens use, in a fixed order of what matters. */
export function cameraPermission(a: CameraAvailability): CameraPermission {
  if (!a.module) return 'not_in_build';
  if (a.hardware === false) return 'no_camera';
  return a.permission ?? 'unknown';
}

const NOT_IN_BUILD: CameraAvailability = { module: false, hardware: null, permission: null, errors: [] };

export const unavailablePoseCamera: PoseCameraService = {
  available: false,
  async getAvailability() {
    return NOT_IN_BUILD;
  },
  async requestPermission() {
    return NOT_IN_BUILD;
  },
  CameraView: null,
};

const message = (label: string, error: unknown) => `${label}: ${error instanceof Error ? error.message : String(error)}`;

/** Reads hardware and permission separately, keeping any error instead of hiding it. */
export async function readAvailability(native: TerbitPoseNativeModule, ask = false): Promise<CameraAvailability> {
  const errors: string[] = [];
  const hardware = await native.isCameraAvailableAsync().then(
    (ok) => ok === true,
    (error: unknown) => {
      errors.push(message('isCameraAvailableAsync', error));
      return null;
    },
  );
  const read = ask ? native.requestCameraPermissionAsync() : native.getCameraPermissionAsync();
  const permission = await read.then(
    (status) => {
      const mapped = mapNativePermission(status);
      if (mapped === null) errors.push(`${ask ? 'request' : 'get'}CameraPermissionAsync returned "${String(status)}"`);
      return mapped;
    },
    (error: unknown) => {
      errors.push(message(ask ? 'requestCameraPermissionAsync' : 'getCameraPermissionAsync', error));
      return null;
    },
  );
  return { module: true, hardware, permission, errors };
}

export function createPoseCameraService(platform: string | undefined, native: TerbitPoseNativeModule | null, view: PoseCameraService['CameraView']): PoseCameraService {
  if (platform !== 'ios' || !native || !view) return unavailablePoseCamera;
  return {
    available: true,
    getAvailability: () => readAvailability(native),
    requestPermission: () => readAvailability(native, true),
    CameraView: view,
  };
}

let service: PoseCameraService | null = null;

export function getPoseCamera(): PoseCameraService {
  service ??= createPoseCameraService(process.env.EXPO_OS, TerbitPose, TerbitPoseCameraView);
  return service;
}

/** DEVELOPER DIAGNOSTICS (development builds only): every condition behind camera counting. */
export async function poseDiagnostics(): Promise<Record<string, string>> {
  const registered = Object.keys((globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules ?? {})
    .filter((name) => /terbit/i.test(name))
    .sort();
  const camera = getPoseCamera();
  const availability = await camera.getAvailability();
  const iosMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : NaN;
  return {
    'Platform (EXPO_OS)': String(process.env.EXPO_OS),
    'iOS version': Platform.OS === 'ios' ? String(Platform.Version) : '—',
    'Native modules (Terbit*)': registered.join(', ') || 'none',
    'TerbitPose module found': TerbitPose ? 'yes' : 'no',
    'Camera view found': TerbitPoseCameraView ? 'yes' : 'no',
    'Service available': camera.available ? 'yes' : 'no',
    'Camera hardware': availability.hardware === null ? 'check failed' : availability.hardware ? 'yes' : 'no',
    'Camera permission (iOS)': availability.permission ?? 'could not read',
    'Vision body pose (iOS 14+)': Number.isFinite(iosMajor) ? (iosMajor >= 14 ? 'supported' : 'not supported') : '—',
    'Result': cameraPermission(availability),
    'Errors': availability.errors.join(' | ') || 'none',
  };
}
