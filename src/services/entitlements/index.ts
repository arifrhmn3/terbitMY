import {
  FREE_STATE,
  initialEntitlement,
  startTrial,
  type EntitlementState,
  type EntitlementTier,
} from '@/features/entitlements/entitlement';
import { ACCESS_POLICY, type AccessPolicy } from '@/features/entitlements/policy';
import type { SettingsStore } from '@/services/storage/settings';

/**
 * Where the user's entitlement comes from. Phase 1: a LOCAL MOCK saved on the
 * device, switchable in developer builds. Later, a store-backed
 * implementation (App Store / Google Play, possibly via RevenueCat) can
 * implement the same interface with no screen changes. No billing exists yet.
 */
export interface EntitlementService {
  load(): Promise<EntitlementState>;
  /** Developer builds only: pretend to be free, on a fresh trial, or premium. */
  setMockTier(tier: EntitlementTier): Promise<EntitlementState>;
}

const KEY = 'entitlement.mock.v1';

export function createMockEntitlementService(
  settings: SettingsStore,
  options: { policy?: AccessPolicy; now?: () => number } = {},
): EntitlementService {
  const { policy = ACCESS_POLICY, now = Date.now } = options;

  return {
    async load() {
      const saved = await settings.get<EntitlementState>(KEY);
      if (saved && ['free', 'trial', 'premium'].includes(saved.tier)) return saved;
      const fresh = initialEntitlement(now(), policy);
      await settings.set(KEY, fresh);
      return fresh;
    },

    async setMockTier(tier) {
      const state: EntitlementState =
        tier === 'trial'
          ? startTrial(now(), policy)
          : tier === 'premium'
            ? { tier: 'premium', trialStartedAt: null, trialEndsAt: null, source: 'mock' }
            : FREE_STATE;
      await settings.set(KEY, state);
      return state;
    },
  };
}
