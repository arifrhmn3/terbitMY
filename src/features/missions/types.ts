import type { MathMissionResult } from './math/session';
import type { QuizMissionResult } from './quiz/types';

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
export type MissionResult = MathMissionResult | QuizMissionResult;

export function isQuizResult(result: MissionResult): result is QuizMissionResult {
  return (result as { type?: string }).type === 'quiz';
}
