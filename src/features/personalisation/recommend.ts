import type { AlarmMission } from '@/features/alarms/alarm';
import { ALARM_DEFAULTS } from '@/features/alarms/alarm-defaults';
import type { MissionCategory } from '@/features/alarms/creation';
import { isTradition, type FaithPreference } from '@/features/faith/types';
import { catalogueFor, EXERCISES } from '@/features/missions/fitness/exercises';
import { CAMERA_CATALOGUE } from '@/features/missions/fitness/pose/camera-activities';
import type { FitnessExercise, MobilityProfile } from '@/features/missions/fitness/types';
import type { MissionDifficulty, MissionQuestionCount } from '@/features/missions/types';

import type { EducationGoal, FaithGoal, FitnessGoal, FocusGoal, GoalId, MovementGoal, ReflectionGoal, TraditionFaithGoal } from './types';

/**
 * GOAL → MISSION RECOMMENDATION POLICY. Deterministic and explicit: every
 * goal maps onto a mission that already exists in Terbit's verified,
 * offline catalogue. Nothing is generated (no AI, no invented missions, no
 * scripture). Changing a mapping means editing this file only.
 *
 * Difficulty starts conservatively at Easy. Future Terbit+ packaging (6E)
 * is expected to keep Free at Easy only; that gate belongs to the
 * entitlement layer, so recommendations never decide it.
 */
export const RECOMMENDATION_POLICY = {
  difficulty: 'easy' as MissionDifficulty,
  questionCount: ALARM_DEFAULTS.questionCount as MissionQuestionCount,
} as const;

export type GoalOption<G extends string> = { id: G; title: string; subtitle: string };

// ── Education ────────────────────────────────────────────────────────────────

/** Each goal names the existing Education content it uses (Maths or a curated quiz pack). */
export const EDUCATION_GOALS: readonly GoalOption<EducationGoal>[] = [
  { id: 'general_knowledge', title: 'Improve my general knowledge', subtitle: 'General Knowledge quiz' },
  { id: 'geography', title: 'Know the world better', subtitle: 'Geography quiz' },
  { id: 'vocabulary', title: 'Build my vocabulary', subtitle: 'Vocabulary quiz' },
  { id: 'thinking', title: 'Challenge my thinking', subtitle: 'Logic quiz' },
  { id: 'numbers', title: 'Sharpen my mental maths', subtitle: 'Maths questions' },
];

export function educationMission(goal: EducationGoal): AlarmMission {
  const { difficulty, questionCount } = RECOMMENDATION_POLICY;
  if (goal === 'numbers') return { type: 'math', difficulty, questionCount };
  const category = goal === 'general_knowledge' ? 'general' : goal === 'thinking' ? 'logic' : goal;
  return { type: 'quiz', category, difficulty, questionCount };
}

// ── Fitness (constrained by the Mobility Profile) ────────────────────────────

const MOVEMENT_GOALS: readonly GoalOption<MovementGoal>[] = [
  { id: 'move_daily', title: 'Move every day', subtitle: '' },
  { id: 'more_active', title: 'Become more active', subtitle: '' },
  { id: 'strength', title: 'Build basic strength', subtitle: '' },
  { id: 'flexibility', title: 'Loosen up in the morning', subtitle: '' },
];

const FOCUS_GOALS: readonly GoalOption<FocusGoal>[] = [
  { id: 'calm', title: 'Start calm and steady', subtitle: '' },
  { id: 'focus', title: 'Sharpen my focus', subtitle: '' },
  { id: 'release', title: 'Release tension', subtitle: '' },
  { id: 'grounded', title: 'Feel grounded', subtitle: '' },
];

/** Every goal → an activity in that profile's own catalogue (`FITNESS_CATALOGUES`). */
const FITNESS_ACTIVITY: Record<MobilityProfile, Partial<Record<FitnessGoal, FitnessExercise>>> = {
  standard: { move_daily: 'walk_in_place', more_active: 'jumping_jacks', strength: 'squats', flexibility: 'stretch' },
  reduced_mobility: { move_daily: 'seated_marching', more_active: 'step_out', strength: 'chair_sit_to_stand', flexibility: 'seated_stretch' },
  non_physical: { calm: 'controlled_breathing', focus: 'number_focus', release: 'hold_release', grounded: 'grounding' },
};

/** The Fitness goals offered for this Mobility Profile, each with the activity it uses. */
export function fitnessGoals(profile: MobilityProfile): GoalOption<FitnessGoal>[] {
  const goals: readonly GoalOption<FitnessGoal>[] = profile === 'non_physical' ? FOCUS_GOALS : MOVEMENT_GOALS;
  return goals.map((g) => ({ ...g, subtitle: EXERCISES[FITNESS_ACTIVITY[profile][g.id]!].label }));
}

/** The activity for a goal under this profile. A goal from another profile falls back to the profile's first goal. */
export function fitnessActivity(goal: FitnessGoal, profile: MobilityProfile): FitnessExercise {
  return FITNESS_ACTIVITY[profile][goal] ?? catalogueFor(profile)[0];
}

export function fitnessMission(goal: FitnessGoal, profile: MobilityProfile): AlarmMission {
  return { type: 'fitness', exercise: fitnessActivity(goal, profile), difficulty: RECOMMENDATION_POLICY.difficulty };
}

/** Whether the recommended activity offers optional camera counting (never for Non-physical). */
export function cameraEligible(goal: FitnessGoal, profile: MobilityProfile): boolean {
  return profile !== 'non_physical' && CAMERA_CATALOGUE[fitnessActivity(goal, profile)].status === 'enabled';
}

// ── Faith (adapts to the private Faith preference) ───────────────────────────

const TRADITION_GOALS: readonly GoalOption<TraditionFaithGoal>[] = [
  { id: 'recitation', title: 'Start the day with recitation', subtitle: 'Daily Recitation' },
  { id: 'reflection', title: 'Build a daily reflection habit', subtitle: 'Guided Reflection' },
  { id: 'recitation_reflection', title: 'Spend time in recitation and reflection', subtitle: 'Recitation, then Reflection' },
];

const REFLECTION_GOALS: readonly GoalOption<ReflectionGoal>[] = [
  { id: 'reflection_habit', title: 'Build a daily reflection habit', subtitle: 'Guided Reflection' },
  { id: 'mindful_start', title: 'Make time to slow down', subtitle: 'Guided Reflection' },
];

/** Recitation goals only when the user has a tradition; otherwise reflection/mindfulness language. */
export function faithGoals(preference: FaithPreference | null): GoalOption<FaithGoal>[] {
  return isTradition(preference) ? [...TRADITION_GOALS] : [...REFLECTION_GOALS];
}

/** What the Faith category is called for this preference ("Reflection" without a tradition). */
export function faithCategoryTitle(preference: FaithPreference | null): string {
  return isTradition(preference) ? 'Faith' : 'Reflection';
}

export function faithMission(goal: FaithGoal, preference: FaithPreference | null): AlarmMission {
  const difficulty = RECOMMENDATION_POLICY.difficulty;
  if (isTradition(preference)) {
    if (goal === 'recitation') return { type: 'recitation', tradition: preference };
    if (goal === 'recitation_reflection') return { type: 'recitation_reflection', tradition: preference, difficulty };
  }
  // Every other case is a guided Reflection, which is for everyone.
  return { type: 'reflection', difficulty };
}

// ── Shared ───────────────────────────────────────────────────────────────────

export type RecommendationContext = { mobilityProfile: MobilityProfile; faith: FaithPreference | null };

export function goalOptions<C extends MissionCategory>(category: C, context: RecommendationContext): GoalOption<GoalId[C]>[] {
  if (category === 'education') return [...EDUCATION_GOALS] as GoalOption<GoalId[C]>[];
  if (category === 'fitness') return fitnessGoals(context.mobilityProfile) as GoalOption<GoalId[C]>[];
  return faithGoals(context.faith) as GoalOption<GoalId[C]>[];
}

/**
 * A stored goal that still makes sense for the current profile and faith:
 * changing Mobility or Faith after picking a goal falls back to that
 * category's first option.
 */
export function validGoal<C extends MissionCategory>(category: C, goal: GoalId[C], context: RecommendationContext): GoalId[C] {
  const options = goalOptions(category, context);
  return options.some((o) => o.id === goal) ? goal : options[0].id;
}

export function recommendedMission<C extends MissionCategory>(category: C, goal: GoalId[C], context: RecommendationContext): AlarmMission {
  if (category === 'education') return educationMission(goal as EducationGoal);
  if (category === 'fitness') return fitnessMission(goal as FitnessGoal, context.mobilityProfile);
  return faithMission(goal as FaithGoal, context.faith);
}

export function goalTitle<C extends MissionCategory>(category: C, goal: GoalId[C], context: RecommendationContext): string {
  return goalOptions(category, context).find((o) => o.id === goal)?.title ?? '';
}

/** "Education", "Fitness" (or "Wake-up activity" for Non-physical), "Faith" (or "Reflection"). */
export function categoryTitle(category: MissionCategory, context: RecommendationContext): string {
  if (category === 'education') return 'Education';
  if (category === 'fitness') return context.mobilityProfile === 'non_physical' ? 'Wake-up activity' : 'Fitness';
  return faithCategoryTitle(context.faith);
}
