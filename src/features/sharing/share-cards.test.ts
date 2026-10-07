import { describe, expect, it } from '@jest/globals';

import { featureChecker, FREE_STATE, type EntitlementState } from '@/features/entitlements/entitlement';
import { FREEMIUM_POLICY } from '@/features/entitlements/policy';

import { availableTemplates, buildShareCard, type ShareCardInput } from './share-cards';

const free = featureChecker(FREE_STATE, 0, FREEMIUM_POLICY);
const premiumState: EntitlementState = { tier: 'premium', trialStartedAt: null, trialEndsAt: null, source: 'mock' };
const premium = featureChecker(premiumState, 0, FREEMIUM_POLICY);

const input: ShareCardInput = {
  kind: 'streak_milestone',
  headline: '30-day streak',
  stats: [{ label: 'Mornings', value: '30' }],
  missionDetails: ['Maths · Hard · 10 questions'],
  alarmTimes: ['06:30'],
};

describe('share cards (architecture only)', () => {
  it('leaves out mission details and alarm times unless the user opts in', () => {
    const card = buildShareCard(input, { templateId: 'simple', has: free });
    expect(card.missionDetails).toEqual([]);
    expect(card.alarmTimes).toEqual([]);
    const optedIn = buildShareCard(input, {
      templateId: 'simple',
      has: free,
      privacy: { includeMissionDetails: true, includeAlarmTimes: false },
    });
    expect(optedIn.missionDetails).toEqual(['Maths · Hard · 10 questions']);
    expect(optedIn.alarmTimes).toEqual([]);
  });

  it('gates branded templates through the entitlement layer', () => {
    expect(availableTemplates(free).map((t) => t.id)).toEqual(['simple']);
    expect(availableTemplates(premium).map((t) => t.id)).toEqual(['simple', 'sunrise-branded']);
    expect(buildShareCard(input, { templateId: 'sunrise-branded', has: free }).templateId).toBe('simple');
    expect(buildShareCard(input, { templateId: 'sunrise-branded', has: premium }).templateId).toBe('sunrise-branded');
  });
});
