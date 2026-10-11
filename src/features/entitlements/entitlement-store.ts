import { useEffect, useSyncExternalStore } from 'react';

import type { EntitlementService } from '@/services/entitlements';

import {
  effectiveTier,
  featureChecker,
  FREE_STATE,
  isPremiumFeature,
  trialDaysLeft,
  type EntitlementState,
  type EntitlementTier,
  type FeatureCheck,
} from './entitlement';
import type { FeatureKey } from './features';
import { ACCESS_POLICY, type AccessPolicy } from './policy';

export type EntitlementSnapshot = {
  status: 'idle' | 'loading' | 'ready';
  state: EntitlementState;
};

/** Holds the current entitlement for screens (via `useEntitlement`) and for non-UI code (via `check()`). */
export function createEntitlementStore(
  service: EntitlementService,
  options: { policy?: AccessPolicy; now?: () => number } = {},
) {
  const { policy = ACCESS_POLICY, now = Date.now } = options;
  let snapshot: EntitlementSnapshot = { status: 'idle', state: FREE_STATE };
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function set(next: EntitlementSnapshot) {
    snapshot = next;
    listeners.forEach((l) => l());
  }

  function ensureLoaded(): Promise<void> {
    if (snapshot.status === 'ready') return Promise.resolve();
    loading ??= (async () => {
      set({ ...snapshot, status: 'loading' });
      set({ status: 'ready', state: await service.load() });
    })().finally(() => {
      loading = null;
    });
    return loading;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ensureLoaded,
    /** `has(feature)` for the current state and time. */
    check(): FeatureCheck {
      return featureChecker(snapshot.state, now(), policy);
    },
    async setMockTier(tier: EntitlementTier) {
      set({ status: 'ready', state: await service.setMockTier(tier) });
    },
    policy,
    now,
  };
}

export type EntitlementStore = ReturnType<typeof createEntitlementStore>;

/** Screens ask this, never "is the user premium". */
export function useEntitlementStore(store: EntitlementStore) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    if (store.getSnapshot().status === 'idle') store.ensureLoaded();
  }, [store]);

  const now = store.now();
  const has = featureChecker(snapshot.state, now, store.policy);
  return {
    ready: snapshot.status === 'ready',
    tier: effectiveTier(snapshot.state, now),
    trialDaysLeft: trialDaysLeft(snapshot.state, now),
    has,
    /** Whether a feature is premium-capable under the current policy (for labels). */
    isPremium: (feature: FeatureKey) => isPremiumFeature(feature, store.policy),
    setMockTier: store.setMockTier,
  };
}
