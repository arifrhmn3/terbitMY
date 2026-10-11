import type { FeatureCheck } from '@/features/entitlements/entitlement';
import type { FeatureKey } from '@/features/entitlements/features';

/**
 * FUTURE FEATURE: architecture only. Shareable achievement cards (like
 * yearly "Wrapped"-style recaps). Nothing renders or shares yet. This file
 * fixes the data shape, the privacy rules and template gating, so the
 * rendering (a branded image) and the native share sheet can be added later
 * behind `ShareService` without changing callers.
 */

export type ShareCardKind = 'streak_milestone' | 'rank_achievement' | 'monthly_consistency' | 'challenge_completed' | 'yearly_recap';

export type ShareCardInput = {
  kind: ShareCardKind;
  /** e.g. "30-day streak", "Rank: Early Riser", "October: 24 of 31 mornings". */
  headline: string;
  /** Key numbers shown on the card. */
  stats: { label: string; value: string }[];
  period?: { from: number; to: number };
  /** Sensitive detail, only shown when the user explicitly opts in (e.g. mission names, alarm times). */
  missionDetails?: string[];
  alarmTimes?: string[];
};

export type SharePrivacy = {
  includeMissionDetails: boolean;
  includeAlarmTimes: boolean;
};

/** Private by default: nothing sensitive leaves the phone unless the user chooses it. */
export const DEFAULT_SHARE_PRIVACY: SharePrivacy = { includeMissionDetails: false, includeAlarmTimes: false };

export type ShareTemplate = {
  id: string;
  name: string;
  /** Which feature unlocks it (basic templates use a free feature). */
  feature: FeatureKey;
};

export const SHARE_TEMPLATES: readonly ShareTemplate[] = [
  { id: 'simple', name: 'Simple', feature: 'basic_progress' },
  { id: 'sunrise-branded', name: 'Sunrise (branded)', feature: 'social_share_templates' },
];

export type ShareCard = {
  kind: ShareCardKind;
  templateId: string;
  headline: string;
  stats: { label: string; value: string }[];
  period?: { from: number; to: number };
  missionDetails: string[];
  alarmTimes: string[];
};

/** Templates this user may use now. */
export function availableTemplates(has: FeatureCheck): ShareTemplate[] {
  return SHARE_TEMPLATES.filter((t) => has(t.feature));
}

/**
 * Builds the card content to render. Sensitive details are dropped unless
 * explicitly included, and a locked template falls back to the basic one.
 */
export function buildShareCard(
  input: ShareCardInput,
  options: { templateId: string; privacy?: SharePrivacy; has: FeatureCheck },
): ShareCard {
  const privacy = options.privacy ?? DEFAULT_SHARE_PRIVACY;
  const template = availableTemplates(options.has).find((t) => t.id === options.templateId) ?? SHARE_TEMPLATES[0];
  return {
    kind: input.kind,
    templateId: template.id,
    headline: input.headline,
    stats: input.stats,
    period: input.period,
    missionDetails: privacy.includeMissionDetails ? (input.missionDetails ?? []) : [],
    alarmTimes: privacy.includeAlarmTimes ? (input.alarmTimes ?? []) : [],
  };
}
