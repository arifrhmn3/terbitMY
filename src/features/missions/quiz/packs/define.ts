import type { MissionDifficulty } from '../../types';
import type { QuizCategory, QuizQuestion } from '../types';

/** Compact authoring helper for a pack file: one call per question. */
export function questionsFor(category: QuizCategory) {
  return (
    id: string,
    difficulty: MissionDifficulty,
    prompt: string,
    answer: string,
    wrong: string[],
    explanation?: string,
  ): QuizQuestion => ({ id, category, difficulty, prompt, answer, wrong, explanation });
}
