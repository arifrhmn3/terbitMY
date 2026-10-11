import { requireOptionalNativeModule } from 'expo';

import type { TerbitAlarmsNativeModule } from './TerbitAlarms.types';

/**
 * The native module, or null where it isn't compiled in: Expo Go, the web
 * preview, unit tests, and any build made before this module was added.
 */
export const TerbitAlarms = requireOptionalNativeModule<TerbitAlarmsNativeModule>('TerbitAlarms');
