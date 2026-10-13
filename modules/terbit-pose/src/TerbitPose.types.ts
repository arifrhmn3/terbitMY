import type { ViewProps } from 'react-native';

/**
 * The native TerbitPose module (iOS): the camera and Apple Vision body-pose
 * detection, entirely on the phone. Frames are analysed in memory and
 * dropped; only joint positions reach JavaScript. Nothing is recorded,
 * saved or uploaded.
 */
export type NativeCameraPermission = 'granted' | 'denied' | 'restricted' | 'undetermined';

export type NativePoseJoint = { x: number; y: number; c: number };

export type NativePoseEvent = {
  /** ms since 1970. */
  at: number;
  /** Analysed image width ÷ height. */
  aspect: number;
  /** Joint name → position (0–1, top-left origin) and confidence. Missing joints are left out. */
  joints: Record<string, NativePoseJoint>;
};

export type NativeCameraErrorEvent = {
  /** permission: not allowed; unavailable: no camera / couldn't start; interrupted: another app or a call took the camera. */
  code: 'permission' | 'unavailable' | 'interrupted';
};

export type TerbitPoseNativeModule = {
  getCameraPermissionAsync(): Promise<NativeCameraPermission>;
  /** Shows iOS's camera prompt only if never asked; otherwise returns the current status. */
  requestCameraPermissionAsync(): Promise<NativeCameraPermission>;
  /** A front or back camera exists (false on the Simulator). */
  isCameraAvailableAsync(): Promise<boolean>;
};

export type TerbitPoseCameraViewProps = ViewProps & {
  /** Runs the camera and analysis only while true (false in the background or when leaving). */
  active: boolean;
  onPose?: (event: { nativeEvent: NativePoseEvent }) => void;
  onCameraError?: (event: { nativeEvent: NativeCameraErrorEvent }) => void;
};
