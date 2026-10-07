import { createEntitlementStore, useEntitlementStore } from './entitlement-store';
import { createMockEntitlementService } from '@/services/entitlements';
import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore, type SettingsStore } from '@/services/storage/settings';

/** Settings persisted in SQLite on the phone. */
const settings: SettingsStore = {
  async get(key) {
    return createSqliteSettingsStore(await getDatabase()).get(key);
  },
  async set(key, value) {
    return createSqliteSettingsStore(await getDatabase()).set(key, value);
  },
};

/** The app's entitlement (Phase 1: local mock, saved on the phone). */
export const entitlements = createEntitlementStore(createMockEntitlementService(settings));

export function useEntitlement() {
  return useEntitlementStore(entitlements);
}
