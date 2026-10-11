import { getCloudConfig } from './config';
import { createSupabaseCloud } from './supabase-cloud';
import type { Cloud } from './types';

export type {
  AuthEvent,
  AuthService,
  Cloud,
  CloudAchievementRow,
  CloudAlarmRow,
  CloudOccurrenceRow,
  CloudProfile,
  CloudStore,
  CloudUser,
  CloudXpRow,
} from './types';
export { CloudError } from './types';

let cloud: Cloud | null | undefined;

/**
 * The cloud (account + backup), or null when this build has no Supabase
 * project configured. Null means guest/local-only: everything still works on
 * the phone.
 */
export function getCloud(): Cloud | null {
  if (cloud === undefined) {
    const config = getCloudConfig();
    cloud = config ? createSupabaseCloud(config) : null;
  }
  return cloud;
}
