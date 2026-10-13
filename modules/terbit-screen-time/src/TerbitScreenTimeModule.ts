import { requireOptionalNativeModule } from 'expo';

import type { TerbitScreenTimeNativeModule } from './TerbitScreenTime.types';

/**
 * The native module, or null where it isn't compiled in: Expo Go, the web
 * preview, Android, unit tests, and builds made before Phase 4.
 */
export const TerbitScreenTime = requireOptionalNativeModule<TerbitScreenTimeNativeModule>('TerbitScreenTime');
