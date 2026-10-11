import type { FeatureKey } from './features';
import { ACCESS_POLICY, type AccessPolicy } from './policy';

/**
 * What the user is entitled to. Phase 1 uses a local mock only; a real
 * store (App Store / Play / RevenueCat) would produce the same shape later.
 */
export type EntitlementTier = 'free' | 'trial' | 'premium';

export type EntitlementState = {
  tier: EntitlementTier;
  /** ms since 1970; set while a trial exists (even after it ends). */
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  /** Where the state came from. Only 'mock' exists in Phase 1. */
  source: 'mock';
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const FREE_STATE: EntitlementState = { tier: 'free', trialStartedAt: null, trialEndsAt: null, source: 'mock' };

export function startTrial(now: number, policy: AccessPolicy = ACCESS_POLICY): EntitlementState {
  return { tier: 'trial', trialStartedAt: now, trialEndsAt: now + policy.trialDays * DAY_MS, source: 'mock' };
}

/** A brand-new user's state under the policy (Model B starts a trial automatically). */
export function initialEntitlement(now: number, policy: AccessPolicy = ACCESS_POLICY): EntitlementState {
  return policy.startTrialOnFirstLaunch ? startTrial(now, policy) : FREE_STATE;
}

/** The tier that actually applies now: an ended trial counts as free. */
export function effectiveTier(state: EntitlementState, now: number): EntitlementTier {
  if (state.tier === 'trial' && (state.trialEndsAt === null || now >= state.trialEndsAt)) return 'free';
  return state.tier;
}

/** The single answer to "can the user use this feature?". */
export function isFeatureAvailable(
  feature: FeatureKey,
  state: EntitlementState,
  now: number,
  policy: AccessPolicy = ACCESS_POLICY,
): boolean {
  switch (effectiveTier(state, now)) {
    case 'premium':
      return policy.premiumFeatures.includes(feature);
    case 'trial':
      return policy.trialFeatures.includes(feature) || policy.freeFeatures.includes(feature);
    case 'free':
      return policy.freeFeatures.includes(feature);
  }
}

/** Features that need more than the free tier under the policy (for "Premium" labels). */
export function isPremiumFeature(feature: FeatureKey, policy: AccessPolicy = ACCESS_POLICY): boolean {
  return !policy.freeFeatures.includes(feature);
}

export function trialDaysLeft(state: EntitlementState, now: number): number | null {
  if (state.tier !== 'trial' || state.trialEndsAt === null) return null;
  return Math.max(0, Math.ceil((state.trialEndsAt - now) / DAY_MS));
}

export type FeatureCheck = (feature: FeatureKey) => boolean;

/** Binds the state, time and policy into one `has(feature)` function to pass around. */
export function featureChecker(state: EntitlementState, now: number, policy: AccessPolicy = ACCESS_POLICY): FeatureCheck {
  return (feature) => isFeatureAvailable(feature, state, now, policy);
}
