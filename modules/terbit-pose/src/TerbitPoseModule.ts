import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';

import type { TerbitPoseCameraViewProps, TerbitPoseNativeModule } from './TerbitPose.types';

/**
 * The native module, or null where it isn't compiled in: Expo Go, the web
 * preview, Android, unit tests, and builds made before Phase 4.5.
 */
export const TerbitPose = requireOptionalNativeModule<TerbitPoseNativeModule>('TerbitPose');

/** The live camera view (only when the module exists; never rendered otherwise). */
export const TerbitPoseCameraView: ComponentType<TerbitPoseCameraViewProps> | null = TerbitPose
  ? requireNativeView<TerbitPoseCameraViewProps>('TerbitPose')
  : null;
