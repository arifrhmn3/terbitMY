import type { QuestionSource } from './packs';
import { selectQuestions, type PreparedQuestion } from './select';
import type { QuizAnswer, QuizMissionConfig, QuizMissionResult } from './types';

/**
 * One quiz mission, as pure state. Each question is answered once:
 * choose → see right or wrong (and the explanation) → next. The mission is
 * complete after the last question, whatever the score; the result records
 * the score for the result screen and history.
 */
export type QuizSession = {
  config: QuizMissionConfig;
  questions: PreparedQuestion[];
  currentIndex: number;
  answers: QuizAnswer[];
  /** The choice made for the current question, once answered. */
  chosenIndex: number | null;
  startedAt: number;
  result: QuizMissionResult | null;
};

export function startQuizSession(params: {
  config: QuizMissionConfig;
  source: QuestionSource;
  seed: number;
  now: number;
  recent?: readonly string[];
}): QuizSession {
  const { config, source, seed, now, recent } = params;
  const questions = selectQuestions({
    pool: source.questions(config.category, config.difficulty),
    count: config.questionCount,
    seed,
    recent,
  });
  return { config, questions, currentIndex: 0, answers: [], chosenIndex: null, startedAt: now, result: null };
}

export function currentQuizQuestion(session: QuizSession): PreparedQuestion | null {
  return session.result ? null : (session.questions[session.currentIndex] ?? null);
}

/** Answers the current question. A second tap on the same question changes nothing. */
export function answerQuiz(session: QuizSession, choiceIndex: number): QuizSession {
  const question = currentQuizQuestion(session);
  if (!question || session.chosenIndex !== null) return session;
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) return session;
  const answer: QuizAnswer = {
    questionId: question.id,
    chosen: question.choices[choiceIndex],
    correctAnswer: question.choices[question.answerIndex],
    isCorrect: choiceIndex === question.answerIndex,
  };
  return { ...session, chosenIndex: choiceIndex, answers: [...session.answers, answer] };
}

/** Moves on after an answer; after the last question the mission is complete. */
export function nextQuizQuestion(session: QuizSession, now: number): QuizSession {
  if (session.result || session.chosenIndex === null) return session;
  const currentIndex = session.currentIndex + 1;
  if (currentIndex < session.questions.length) return { ...session, currentIndex, chosenIndex: null };
  const correctCount = session.answers.filter((a) => a.isCorrect).length;
  const questionCount = session.questions.length;
  return {
    ...session,
    currentIndex,
    chosenIndex: null,
    result: {
      type: 'quiz',
      category: session.config.category,
      difficulty: session.config.difficulty,
      questionCount,
      correctCount,
      accuracy: questionCount === 0 ? 0 : correctCount / questionCount,
      durationMs: Math.max(0, now - session.startedAt),
      answers: session.answers,
    },
  };
}
