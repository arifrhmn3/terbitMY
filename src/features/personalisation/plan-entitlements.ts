import { missionDifficulty } from '@/features/alarms/alarm';
import { MODE_FEATURE, requiredFeatures } from '@/features/alarms/alarm-features';
import { isPremiumFeature, type FeatureCheck } from '@/features/entitlements/entitlement';
import type { FeatureKey } from '@/features/entitlements/features';
import { ACCESS_POLICY, type AccessPolicy } from '@/features/entitlements/policy';

import type { PlannedAlarm, PlanSlot, RoutinePlan } from './plan';

/**
 * TERBIT+ READINESS FOR GENERATED ROUTINES (planned packaging; nothing is
 * gated in 6A and there is no paywall). The generator always builds the
 * full routine; this file only says which parts would need Terbit+, so 6E
 * can label or limit them without changing the schedule engine.
 *
 *   FREE:     Gentle and Reward · Easy · basic missions · ONE basic alarm
 *             (the weekday / daily Main Wake-Up) · no Night Routine
 *   TERBIT+:  the full routine · Challenge · every difficulty · several
 *             alarms · Night Routine · all content
 *
 * Each reason maps to an entitlement feature, and whether that feature is
 * premium is decided by the access policy (`policy.ts`), not here.
 */
export type PlusReason = 'challenge' | 'extra_alarm' | 'difficulty' | 'premium_content' | 'night_routine';

export const PLUS_FEATURE: Record<PlusReason, FeatureKey> = {
  challenge: MODE_FEATURE.challenge,
  extra_alarm: 'multiple_alarms',
  difficulty: 'all_difficulties',
  premium_content: 'advanced_missions',
  night_routine: 'night_routine',
};

/** The one alarm a Free routine keeps: the weekday (or every-day) Main Wake-Up. */
export const BASIC_ALARM_SLOT: PlanSlot = 'wake:weekday';

/** Why this generated alarm would need Terbit+ under the policy (empty: it's part of the Free routine). */
export function alarmPlusReasons(item: PlannedAlarm, policy: AccessPolicy = ACCESS_POLICY): PlusReason[] {
  const premium = (f: FeatureKey) => isPremiumFeature(f, policy);
  const reasons: PlusReason[] = [];
  const { draft } = item;
  if (premium(MODE_FEATURE[draft.completionMode])) reasons.push('challenge');
  if (item.slot !== BASIC_ALARM_SLOT && premium(PLUS_FEATURE.extra_alarm)) reasons.push('extra_alarm');
  const difficulty = missionDifficulty(draft.mission);
  if (difficulty && difficulty !== 'easy' && premium(PLUS_FEATURE.difficulty)) reasons.push('difficulty');
  // Content (missions, sounds) follows the alarm's own feature needs, so content marked premium later flows through.
  const content = requiredFeatures(draft).filter((f) => f !== MODE_FEATURE[draft.completionMode]);
  if (content.some(premium)) reasons.push('premium_content');
  return reasons;
}

export type PlanPlus = {
  alarms: Partial<Record<PlanSlot, PlusReason[]>>;
  night: PlusReason[];
  /** Everything in the plan is in the Free routine. */
  free: boolean;
};

/** Terbit+ reasons for every part of a generated routine. Pure; changes nothing. */
export function planPlusReasons(plan: RoutinePlan, policy: AccessPolicy = ACCESS_POLICY): PlanPlus {
  const alarms: PlanPlus['alarms'] = {};
  for (const item of plan.alarms) alarms[item.slot] = alarmPlusReasons(item, policy);
  const night: PlusReason[] = plan.night && isPremiumFeature(PLUS_FEATURE.night_routine, policy) ? ['night_routine'] : [];
  return { alarms, night, free: night.length === 0 && Object.values(alarms).every((r) => r!.length === 0) };
}

/** The reasons this user doesn't have access to yet (what a 6E preview would mark "Terbit+"). */
export function lockedReasons(reasons: readonly PlusReason[], has: FeatureCheck): PlusReason[] {
  return reasons.filter((r) => !has(PLUS_FEATURE[r]));
}
