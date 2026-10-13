import type { SymbolViewProps } from 'expo-symbols';

import { faithMissionKinds, primaryTradition, visibleTraditions } from '@/features/faith/faith-settings';
import type { FaithSettings } from '@/features/faith/types';
import { catalogueFor, EXERCISES, formatTarget } from '@/features/missions/fitness/exercises';
import type { MobilityProfile } from '@/features/missions/fitness/types';
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABEL } from '@/features/missions/quiz/types';

import { createAlarmDraft, describeMission, type AlarmDraft, type AlarmMission } from './alarm';
import { ALARM_DEFAULTS } from './alarm-defaults';

/**
 * Mission-first alarm creation:
 *
 *   category → mission/activity → time → Save Alarm (defaults) or Customise
 *
 * The steps are data, so a routine step (Morning / Throughout the Day /
 * Night) can be put in front in Phase 4 without rewriting the flow: add
 * 'routine' to CREATION_STEPS, set `routineContext` in the state, and let
 * `categoriesFor` filter by it. Nothing about routines is offered yet;
 * until it is, `routineContextFor` (morning.ts) infers Morning from the time.
 */
export type CreationStep = 'category' | 'mission' | 'time';
export const CREATION_STEPS: readonly CreationStep[] = ['category', 'mission', 'time'];

/** Planned (Phase 4): where in the day an alarm belongs. Not stored or shown yet. */
export type RoutineContext = 'morning' | 'day' | 'night';

export type MissionCategory = 'education' | 'fitness' | 'faith';
export const MISSION_CATEGORIES: readonly MissionCategory[] = ['education', 'fitness', 'faith'];

/** What Terbit already knows about the user, so it never asks again. */
export type CreationContext = { mobilityProfile: MobilityProfile; faith: FaithSettings };

export type CategoryOption = { id: MissionCategory; title: string; subtitle: string; icon: SymbolViewProps['name'] };

/** Step 1. Fitness is called "Wake-up activity" for the Non-physical Mobility Profile. */
export function categoriesFor(context: CreationContext): CategoryOption[] {
  const nonPhysical = context.mobilityProfile === 'non_physical';
  const fitnessNames = catalogueFor(context.mobilityProfile).map((e) => EXERCISES[e].label);
  return [
    {
      id: 'education',
      title: 'Education',
      subtitle: 'Maths or a quiz: General Knowledge, Geography, Vocabulary, Logic',
      icon: { ios: 'graduationcap', android: 'school', web: 'school' },
    },
    {
      id: 'fitness',
      title: nonPhysical ? 'Wake-up activity' : 'Fitness',
      subtitle: fitnessNames.join(', '),
      icon: nonPhysical
        ? { ios: 'wind', android: 'air', web: 'air' }
        : { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
    },
    {
      id: 'faith',
      title: 'Faith',
      subtitle: faithMissionKinds(context.faith).includes('recitation') ? 'Recitation and Reflection / Meditation' : 'Reflection / Meditation',
      icon: { ios: 'moon.stars', android: 'nights_stay', web: 'nights_stay' },
    },
  ];
}

export function isMissionCategory(value: unknown): value is MissionCategory {
  return MISSION_CATEGORIES.includes(value as MissionCategory);
}

/** One choice in step 2: a ready mission with default settings. */
export type MissionChoice = { id: string; title: string; subtitle: string; mission: AlarmMission };

const FAITH_TITLE = { recitation: 'Recitation', reflection: 'Reflection / Meditation', recitation_reflection: 'Recitation + Reflection' };

/**
 * Step 2: only the chosen category's catalogue, with default settings.
 * Fitness shows the user's Mobility Profile catalogue only; Faith follows
 * their primary faith and "Explore other faith traditions".
 */
export function missionChoices(category: MissionCategory, context: CreationContext): MissionChoice[] {
  const difficulty = ALARM_DEFAULTS.difficulty;
  const questionCount = ALARM_DEFAULTS.questionCount;
  if (category === 'education') {
    const choices: MissionChoice[] = [
      {
        id: 'math',
        title: 'Maths',
        subtitle: 'Solve sums to prove you’re awake',
        mission: { type: 'math', difficulty, questionCount },
      },
    ];
    for (const topic of QUIZ_CATEGORIES) {
      choices.push({
        id: `quiz-${topic}`,
        title: QUIZ_CATEGORY_LABEL[topic],
        subtitle: 'Quiz',
        mission: { type: 'quiz', category: topic, difficulty, questionCount },
      });
    }
    return choices;
  }
  if (category === 'fitness') {
    return catalogueFor(context.mobilityProfile).map((exercise) => ({
      id: exercise,
      title: EXERCISES[exercise].label,
      subtitle: formatTarget(exercise, difficulty),
      mission: { type: 'fitness', exercise, difficulty },
    }));
  }
  const tradition = primaryTradition(context.faith) ?? visibleTraditions(context.faith)[0] ?? null;
  return faithMissionKinds(context.faith).flatMap((kind): MissionChoice[] => {
    if (kind === 'reflection') {
      return [{ id: kind, title: FAITH_TITLE[kind], subtitle: describeMission({ type: 'reflection', difficulty }), mission: { type: 'reflection', difficulty } }];
    }
    if (!tradition) return [];
    const mission: AlarmMission =
      kind === 'recitation' ? { type: 'recitation', tradition } : { type: 'recitation_reflection', tradition, difficulty };
    return [{ id: kind, title: FAITH_TITLE[kind], subtitle: describeMission(mission), mission }];
  });
}

export function findChoice(category: MissionCategory, id: string, context: CreationContext): MissionChoice | null {
  return missionChoices(category, context).find((c) => c.id === id) ?? null;
}

/** What the flow has collected so far. */
export type CreationState = {
  routineContext?: RoutineContext;
  mission: AlarmMission;
  hour: number;
  minute: number;
};

/**
 * Step 3, Save Alarm: a complete, valid alarm from the central defaults
 * (mode, repeat, snooze, sound) plus the chosen mission and time. Customise
 * starts from the same draft. It's never the Main Wake-Up by default: saving
 * a morning alarm asks (see `mainWakeUpDecision` in morning.ts).
 */
export function draftFromCreation(state: CreationState): AlarmDraft {
  return createAlarmDraft({ mission: state.mission, hour: state.hour, minute: state.minute });
}

/** A mission-specific setting in Customise / the alarm editor. */
export type MissionControl = 'topic' | 'exercise' | 'tradition' | 'reflectionLength' | 'difficulty' | 'questionCount';

/**
 * Progressive disclosure: the settings that apply to this mission only
 * (question count only for Maths and Quiz, Reflection length only with a
 * Reflection, and so on). Tradition is further limited to users who can
 * choose between traditions.
 */
export function missionControls(mission: AlarmMission): MissionControl[] {
  switch (mission.type) {
    case 'math':
      return ['difficulty', 'questionCount'];
    case 'quiz':
      return ['topic', 'difficulty', 'questionCount'];
    case 'fitness':
      return ['exercise', 'difficulty'];
    case 'recitation':
      return ['tradition'];
    case 'reflection':
      return ['reflectionLength'];
    case 'recitation_reflection':
      return ['tradition', 'reflectionLength'];
    case 'none':
      return [];
  }
}

/** Route params for practising a mission (Practice screen). */
export function practiceParams(mission: AlarmMission): Record<string, string | undefined> {
  if (mission.type === 'none') return {};
  return {
    mission: mission.type,
    category: mission.type === 'quiz' ? mission.category : undefined,
    exercise: mission.type === 'fitness' ? mission.exercise : undefined,
    tradition: mission.type === 'recitation' || mission.type === 'recitation_reflection' ? mission.tradition : undefined,
    difficulty: mission.type === 'recitation' ? undefined : mission.difficulty,
    count: mission.type === 'math' || mission.type === 'quiz' ? String(mission.questionCount) : undefined,
  };
}
