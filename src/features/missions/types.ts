import type { FitnessMissionResult } from './fitness/types';
import type { MathMissionResult } from './math/session';
import type { QuizMissionResult } from './quiz/types';
import type { CombinedFaithMissionResult } from '@/features/faith/combined';
import type { RecitationMissionResult } from '@/features/faith/recitation/types';
import type { ReflectionMissionResult } from '@/features/faith/reflection/types';

/**
 * Shared by every mission. A completed mission produces one MissionResult,
 * stored on the occurrence (`result.mission`) and judged by the same
 * accountability and progression rules whatever the mission type.
 */
export type MissionDifficulty = 'easy' | 'medium' | 'hard';
export type MissionQuestionCount = 3 | 5 | 10;

export const MISSION_DIFFICULTIES: readonly MissionDifficulty[] = ['easy', 'medium', 'hard'];
export const MISSION_QUESTION_COUNTS: readonly MissionQuestionCount[] = [3, 5, 10];

export const DIFFICULTY_LABEL: Record<MissionDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Maths results predate the `type` field, so a result without one is maths. */
export type MissionResult =
  | MathMissionResult
  | QuizMissionResult
  | FitnessMissionResult
  | RecitationMissionResult
  | ReflectionMissionResult
  | CombinedFaithMissionResult;

export function isQuizResult(result: MissionResult): result is QuizMissionResult {
  return (result as { type?: string }).type === 'quiz';
}

export function isFitnessResult(result: MissionResult): result is FitnessMissionResult {
  return (result as { type?: string }).type === 'fitness';
}

export function isRecitationResult(result: MissionResult): result is RecitationMissionResult {
  return (result as { type?: string }).type === 'recitation';
}

export function isReflectionResult(result: MissionResult): result is ReflectionMissionResult {
  return (result as { type?: string }).type === 'reflection';
}

export function isCombinedFaithResult(result: MissionResult): result is CombinedFaithMissionResult {
  return (result as { type?: string }).type === 'recitation_reflection';
}

export function isMathResult(result: MissionResult): result is MathMissionResult {
  const type = (result as { type?: string }).type;
  return type === undefined || type === 'math';
}
