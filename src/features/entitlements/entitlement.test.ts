import { describe, expect, it } from '@jest/globals';

import { createMockEntitlementService } from '@/services/entitlements';
import { createMemorySettingsStore } from '@/services/storage/settings';

import {
  effectiveTier,
  featureChecker,
  FREE_STATE,
  initialEntitlement,
  isFeatureAvailable,
  isPremiumFeature,
  startTrial,
  trialDaysLeft,
  type EntitlementState,
} from './entitlement';
import { createEntitlementStore } from './entitlement-store';
import { FEATURE_KEYS } from './features';
import { FREEMIUM_POLICY, TRIAL_POLICY } from './policy';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const PREMIUM: EntitlementState = { tier: 'premium', trialStartedAt: null, trialEndsAt: null, source: 'mock' };

describe('isFeatureAvailable: Model A (freemium)', () => {
  const policy = FREEMIUM_POLICY;

  it('free users get core features only; Challenge Mode is blocked', () => {
    expect(isFeatureAvailable('reward_mode', FREE_STATE, NOW, policy)).toBe(true);
    expect(isFeatureAvailable('gentle_mode', FREE_STATE, NOW, policy)).toBe(true);
    expect(isFeatureAvailable('basic_missions', FREE_STATE, NOW, policy)).toBe(true);
    expect(isFeatureAvailable('challenge_mode', FREE_STATE, NOW, policy)).toBe(false);
    expect(isFeatureAvailable('premium_alarm_sounds', FREE_STATE, NOW, policy)).toBe(false);
    expect(isFeatureAvailable('social_share_templates', FREE_STATE, NOW, policy)).toBe(false);
  });

  it('premium unlocks every feature', () => {
    for (const feature of FEATURE_KEYS) expect(isFeatureAvailable(feature, PREMIUM, NOW, policy)).toBe(true);
  });

  it('an active trial unlocks everything; an ended trial falls back to free', () => {
    const trial = startTrial(NOW, policy);
    expect(isFeatureAvailable('challenge_mode', trial, NOW + 6 * DAY, policy)).toBe(true);
    expect(effectiveTier(trial, NOW + 7 * DAY)).toBe('free');
    expect(isFeatureAvailable('challenge_mode', trial, NOW + 7 * DAY, policy)).toBe(false);
    expect(isFeatureAvailable('reward_mode', trial, NOW + 7 * DAY, policy)).toBe(true);
  });

  it('starts new users on the free tier and labels premium features', () => {
    expect(initialEntitlement(NOW, policy)).toEqual(FREE_STATE);
    expect(isPremiumFeature('challenge_mode', policy)).toBe(true);
    expect(isPremiumFeature('gentle_mode', policy)).toBe(false);
  });
});

describe('isFeatureAvailable: Model B (full app with trial)', () => {
  const policy = TRIAL_POLICY;

  it('starts a 7-day trial for new users with everything unlocked', () => {
    const state = initialEntitlement(NOW, policy);
    expect(state).toMatchObject({ tier: 'trial', trialStartedAt: NOW, trialEndsAt: NOW + 7 * DAY });
    expect(trialDaysLeft(state, NOW + 2 * DAY)).toBe(5);
    for (const feature of FEATURE_KEYS) expect(isFeatureAvailable(feature, state, NOW + DAY, policy)).toBe(true);
  });

  it('after the trial, full functionality needs a subscription (only the minimum stays)', () => {
    const ended = startTrial(NOW, policy);
    const later = NOW + 8 * DAY;
    expect(isFeatureAvailable('reward_mode', ended, later, policy)).toBe(true);
    expect(isFeatureAvailable('gentle_mode', ended, later, policy)).toBe(false);
    expect(isFeatureAvailable('challenge_mode', ended, later, policy)).toBe(false);
    expect(isFeatureAvailable('gentle_mode', PREMIUM, later, policy)).toBe(true);
  });

  it('the same stored state is judged differently just by switching policy', () => {
    const has = (policyName: 'A' | 'B') =>
      featureChecker(FREE_STATE, NOW, policyName === 'A' ? FREEMIUM_POLICY : TRIAL_POLICY)('gentle_mode');
    expect(has('A')).toBe(true);
    expect(has('B')).toBe(false);
  });
});

describe('mock entitlement service and store', () => {
  it('creates and saves the initial state, then switches test tiers', async () => {
    const settings = createMemorySettingsStore();
    const service = createMockEntitlementService(settings, { policy: FREEMIUM_POLICY, now: () => NOW });
    expect(await service.load()).toEqual(FREE_STATE);

    await service.setMockTier('premium');
    expect((await createMockEntitlementService(settings, { now: () => NOW }).load()).tier).toBe('premium');
    expect(await service.setMockTier('trial')).toMatchObject({ tier: 'trial', trialEndsAt: NOW + 7 * DAY });
  });

  it('answers has(feature) for non-UI code after loading', async () => {
    const service = createMockEntitlementService(createMemorySettingsStore(), { now: () => NOW });
    const store = createEntitlementStore(service, { policy: FREEMIUM_POLICY, now: () => NOW });
    await store.ensureLoaded();
    expect(store.check()('challenge_mode')).toBe(false);
    await store.setMockTier('premium');
    expect(store.check()('challenge_mode')).toBe(true);
  });
});
