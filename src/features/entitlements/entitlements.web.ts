import { createEntitlementStore, useEntitlementStore } from './entitlement-store';
import { createMockEntitlementService } from '@/services/entitlements';
import { createMemorySettingsStore } from '@/services/storage/settings';

/** Web preview: entitlement kept in memory only. */
export const entitlements = createEntitlementStore(createMockEntitlementService(createMemorySettingsStore()));

export function useEntitlement() {
  return useEntitlementStore(entitlements);
}
