/**
 * Every capability that could be ringfenced later. Screens ask
 * `isFeatureAvailable(feature, …)` (or `useEntitlement().has(feature)`)
 * instead of checking "is the user premium". Names may be refined.
 */
export type FeatureKey =
  // Core: free in the provisional freemium policy
  | 'reward_mode'
  | 'gentle_mode'
  | 'basic_missions'
  | 'basic_alarm_sounds'
  | 'basic_progress'
  // Premium-capable
  | 'challenge_mode'
  | 'premium_alarm_sounds'
  | 'advanced_missions'
  | 'advanced_analytics'
  | 'social_share_templates'
  | 'multiple_accountability_circles';

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'reward_mode',
  'gentle_mode',
  'basic_missions',
  'basic_alarm_sounds',
  'basic_progress',
  'challenge_mode',
  'premium_alarm_sounds',
  'advanced_missions',
  'advanced_analytics',
  'social_share_templates',
  'multiple_accountability_circles',
];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  reward_mode: 'Reward Mode',
  gentle_mode: 'Gentle Mode',
  basic_missions: 'Basic missions',
  basic_alarm_sounds: 'Basic alarm sounds',
  basic_progress: 'Streaks and progress',
  challenge_mode: 'Challenge Mode',
  premium_alarm_sounds: 'Premium alarm sounds',
  advanced_missions: 'Advanced missions',
  advanced_analytics: 'Advanced analytics',
  social_share_templates: 'Branded share cards',
  multiple_accountability_circles: 'Multiple accountability circles',
};
