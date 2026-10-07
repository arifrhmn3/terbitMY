import { FEATURE_KEYS, type FeatureKey } from './features';

/**
 * PROVISIONAL PRODUCT POLICY. The business model isn't decided yet; beta may
 * switch between these presets or change them. Changing access rules means
 * editing this file only, with no database or screen changes.
 */
export type AccessPolicy = {
  name: string;
  /** Features anyone has, with or without a trial or subscription. */
  freeFeatures: readonly FeatureKey[];
  /** Features a trial unlocks (usually everything). */
  trialFeatures: readonly FeatureKey[];
  /** Features a subscription unlocks (usually everything). */
  premiumFeatures: readonly FeatureKey[];
  trialDays: number;
  /** Model B: a new user starts a trial automatically. */
  startTrialOnFirstLaunch: boolean;
};

const CORE: readonly FeatureKey[] = ['reward_mode', 'gentle_mode', 'basic_missions', 'basic_alarm_sounds', 'basic_progress'];

/** Model A: core features free forever; premium features need a subscription (an optional trial unlocks all). */
export const FREEMIUM_POLICY: AccessPolicy = {
  name: 'Model A: Freemium',
  freeFeatures: CORE,
  trialFeatures: FEATURE_KEYS,
  premiumFeatures: FEATURE_KEYS,
  trialDays: 7,
  startTrialOnFirstLaunch: false,
};

/** Model B: everything for a 7-day trial, then a subscription is needed for full functionality. */
export const TRIAL_POLICY: AccessPolicy = {
  name: 'Model B: Full app with trial',
  // What stays usable after the trial is a product decision; core alarm use is kept so alarms never break.
  freeFeatures: ['reward_mode', 'basic_alarm_sounds'],
  trialFeatures: FEATURE_KEYS,
  premiumFeatures: FEATURE_KEYS,
  trialDays: 7,
  startTrialOnFirstLaunch: true,
};

/** The policy in effect. Provisional: switch to TRIAL_POLICY to test Model B. */
export const ACCESS_POLICY: AccessPolicy = FREEMIUM_POLICY;
