import type { MissionDifficulty, MissionQuestionCount } from '../types';

/** Education quiz topics. Maths stays its own mission type. */
export type QuizCategory = 'general' | 'geography' | 'vocabulary' | 'logic';

export const QUIZ_CATEGORIES: readonly QuizCategory[] = ['general', 'geography', 'vocabulary', 'logic'];

export const QUIZ_CATEGORY_LABEL: Record<QuizCategory, string> = {
  general: 'General Knowledge',
  geography: 'Geography',
  vocabulary: 'Vocabulary',
  logic: 'Logic',
};

/** Short labels for segmented controls. */
export const QUIZ_CATEGORY_SHORT: Record<QuizCategory, string> = {
  general: 'General',
  geography: 'Geography',
  vocabulary: 'Words',
  logic: 'Logic',
};

/**
 * One curated question. `id` is stable forever (history and "recently asked"
 * refer to it); fix a mistake by editing the text, retire a question by
 * removing it, but never reuse an id.
 */
export type QuizQuestion = {
  id: string;
  category: QuizCategory;
  difficulty: MissionDifficulty;
  prompt: string;
  /** The correct answer, exactly as shown. */
  answer: string;
  /** Wrong answers (the choices shown are the answer plus these, shuffled). */
  wrong: string[];
  explanation?: string;
  tags?: string[];
};

/** A set of questions shipped with the app (later: downloaded or topic packs). */
export type QuizPack = {
  id: string;
  version: number;
  title: string;
  questions: QuizQuestion[];
};

export type QuizMissionConfig = {
  category: QuizCategory;
  difficulty: MissionDifficulty;
  questionCount: MissionQuestionCount;
};

/** What the user answered, for the result review. */
export type QuizAnswer = {
  questionId: string;
  chosen: string;
  correctAnswer: string;
  isCorrect: boolean;
};

export type QuizMissionResult = {
  type: 'quiz';
  category: QuizCategory;
  difficulty: MissionDifficulty;
  questionCount: number;
  correctCount: number;
  /** correctCount / questionCount, from 0 to 1. */
  accuracy: number;
  durationMs: number;
  answers: QuizAnswer[];
};
