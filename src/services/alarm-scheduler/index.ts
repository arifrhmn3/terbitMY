import { createNotImplementedAlarmService } from './not-implemented';
import type { AlarmService } from './types';

export type * from './types';

let service: AlarmService | null = null;

/**
 * Returns the alarm service for this platform.
 *
 * Native triggering is NOT implemented yet. When it is, add
 * `index.ios.ts` (AlarmKit) and `index.android.ts` (AlarmManager) next to
 * this file; Metro picks them automatically and the UI stays the same.
 */
export function getAlarmService(): AlarmService {
  service ??= createNotImplementedAlarmService();
  return service;
}
