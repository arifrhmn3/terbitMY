import { describe, expect, it } from '@jest/globals';

import { featureChecker, FREE_STATE, type EntitlementState } from '@/features/entitlements/entitlement';
import { FREEMIUM_POLICY } from '@/features/entitlements/policy';

import { createAlarmDraft, type Alarm } from './alarm';
import {
  effectiveCompletionMode,
  isModeAvailable,
  lockedFeatures,
  requiredFeatures,
  withEffectiveSettings,
} from './alarm-features';

const PREMIUM: EntitlementState = { tier: 'premium', trialStartedAt: null, trialEndsAt: null, source: 'mock' };
const free = featureChecker(FREE_STATE, 0, FREEMIUM_POLICY);
const premium = featureChecker(PREMIUM, 0, FREEMIUM_POLICY);

function alarm(overrides: Partial<Alarm>): Alarm {
  return { ...createAlarmDraft(overrides), id: overrides.id ?? 'a', createdAt: 0, updatedAt: 0 };
}

describe('per-alarm modes', () => {
  it('stores the mode on each alarm, so two alarms can differ', () => {
    const weekday = alarm({ id: 'weekday', hour: 6, minute: 30, weekdays: [1, 2, 3, 4, 5], completionMode: 'challenge' });
    const weekend = alarm({ id: 'weekend', hour: 8, minute: 30, weekdays: [0, 6], completionMode: 'gentle', gentleReminderMinutes: 15 });
    const afternoon = alarm({ id: 'pm', hour: 14, minute: 0, weekdays: [], completionMode: 'reward' });

    expect([weekday, weekend, afternoon].map((a) => a.completionMode)).toEqual(['challenge', 'gentle', 'reward']);
    expect(effectiveCompletionMode(weekday, premium)).toBe('challenge');
    expect(effectiveCompletionMode(weekend, premium)).toBe('gentle');
    expect(effectiveCompletionMode(afternoon, premium)).toBe('reward');
  });

  it('lists the features an alarm relies on', () => {
    expect(requiredFeatures(alarm({ completionMode: 'challenge' }))).toEqual(['challenge_mode', 'basic_alarm_sounds', 'basic_missions']);
    expect(requiredFeatures(alarm({ completionMode: 'gentle', mission: { type: 'none' } }))).toEqual([
      'gentle_mode',
      'basic_alarm_sounds',
    ]);
  });
});

describe('Challenge Mode and entitlements', () => {
  const challenge = alarm({ completionMode: 'challenge' });

  it('is blocked without the entitlement: the alarm still rings, as Reward', () => {
    expect(isModeAvailable('challenge', free)).toBe(false);
    expect(lockedFeatures(challenge, free)).toEqual(['challenge_mode']);
    expect(effectiveCompletionMode(challenge, free)).toBe('reward');
    const effective = withEffectiveSettings(challenge, free);
    expect(effective.completionMode).toBe('reward');
    expect(effective.enabled).toBe(true);
    // The saved setting is untouched.
    expect(challenge.completionMode).toBe('challenge');
  });

  it('works when the entitlement allows it', () => {
    expect(isModeAvailable('challenge', premium)).toBe(true);
    expect(lockedFeatures(challenge, premium)).toEqual([]);
    expect(withEffectiveSettings(challenge, premium)).toBe(challenge);
  });

  it('keeps Reward and Gentle available on the free tier', () => {
    expect(isModeAvailable('reward', free)).toBe(true);
    expect(isModeAvailable('gentle', free)).toBe(true);
  });

  it('falls back to the default sound if a sound is locked or unknown', () => {
    expect(withEffectiveSettings(alarm({ soundId: 'not-a-sound' }), free).soundId).toBe('not-a-sound');
    expect(withEffectiveSettings(alarm({ soundId: 'system-default' }), free).soundId).toBe('system-default');
  });
});
