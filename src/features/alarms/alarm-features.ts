import type { FeatureCheck } from '@/features/entitlements/entitlement';
import type { FeatureKey } from '@/features/entitlements/features';

import type { Alarm, CompletionMode } from './alarm';
import { DEFAULT_SOUND_ID, findSound } from './sounds';

/**
 * Connects each alarm's settings to the entitlement layer. Nothing about
 * "premium" is stored on the alarm: what an alarm needs is derived here from
 * its settings, and what's allowed comes from the access policy. So the
 * policy can change during beta without touching saved alarms.
 */

export const MODE_FEATURE: Record<CompletionMode, FeatureKey> = {
  reward: 'reward_mode',
  gentle: 'gentle_mode',
  challenge: 'challenge_mode',
};

/** Every feature this alarm's settings rely on. */
export function requiredFeatures(alarm: Pick<Alarm, 'completionMode' | 'mission' | 'soundId'>): FeatureKey[] {
  const features: FeatureKey[] = [MODE_FEATURE[alarm.completionMode], findSound(alarm.soundId).feature];
  if (alarm.mission.type === 'math') features.push('basic_missions');
  return [...new Set(features)];
}

/** Features this alarm uses that the user can't currently use. */
export function lockedFeatures(alarm: Pick<Alarm, 'completionMode' | 'mission' | 'soundId'>, has: FeatureCheck): FeatureKey[] {
  return requiredFeatures(alarm).filter((f) => !has(f));
}

export function isModeAvailable(mode: CompletionMode, has: FeatureCheck): boolean {
  return has(MODE_FEATURE[mode]);
}

/**
 * The mode actually used when the alarm rings. If the saved mode isn't
 * available (for example a trial ended), it falls back to Reward. The saved
 * setting is kept, so it comes back if access returns. An alarm is never
 * stopped from ringing because of entitlements.
 */
export function effectiveCompletionMode(alarm: Pick<Alarm, 'completionMode'>, has: FeatureCheck): CompletionMode {
  return isModeAvailable(alarm.completionMode, has) ? alarm.completionMode : 'reward';
}

export function effectiveSoundId(alarm: Pick<Alarm, 'soundId'>, has: FeatureCheck): string {
  return has(findSound(alarm.soundId).feature) ? alarm.soundId : DEFAULT_SOUND_ID;
}

/** The alarm as it will actually behave now: mode and sound adjusted to what's available. */
export function withEffectiveSettings(alarm: Alarm, has: FeatureCheck): Alarm {
  const completionMode = effectiveCompletionMode(alarm, has);
  const soundId = effectiveSoundId(alarm, has);
  return completionMode === alarm.completionMode && soundId === alarm.soundId ? alarm : { ...alarm, completionMode, soundId };
}
