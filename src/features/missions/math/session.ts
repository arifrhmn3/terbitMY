import {
  checkAnswer,
  generateMathQuestions,
  type AnswerCheck,
  type MathDifficulty,
  type MathQuestion,
  type MathQuestionCount,
} from './questions';

export type MathMissionConfig = {
  difficulty: MathDifficulty;
  questionCount: MathQuestionCount;
};

export type MathMissionResult = {
  difficulty: MathDifficulty;
  questionCount: number;
  /** Number of whole-number answers submitted, right or wrong. */
  attempts: number;
  wrongAttempts: number;
  /** Share of submitted answers that were right, from 0 to 1. */
  accuracy: number;
  durationMs: number;
};

export type MathSession = {
  config: MathMissionConfig;
  questions: MathQuestion[];
  currentIndex: number;
  attempts: number;
  wrongAttempts: number;
  /** Outcome of the last submission, for feedback in the UI. */
  lastCheck: AnswerCheck | null;
  startedAt: number;
  result: MathMissionResult | null;
};

export function startMathSession(config: MathMissionConfig, seed: number, now: number): MathSession {
  return {
    config,
    questions: generateMathQuestions(config.difficulty, config.questionCount, seed),
    currentIndex: 0,
    attempts: 0,
    wrongAttempts: 0,
    lastCheck: null,
    startedAt: now,
    result: null,
  };
}

export function currentQuestion(session: MathSession): MathQuestion | null {
  return session.result ? null : session.questions[session.currentIndex] ?? null;
}

/**
 * Submits an answer to the current question and returns the next state.
 * A wrong answer keeps the same question so the user must retry it.
 * Invalid input (empty, letters, decimals) is not counted as an attempt.
 */
export function submitMathAnswer(session: MathSession, input: string, now: number): MathSession {
  const question = currentQuestion(session);
  if (!question) return session;

  const check = checkAnswer(question, input);
  if (check === 'invalid') {
    return { ...session, lastCheck: check };
  }

  const attempts = session.attempts + 1;
  if (check === 'incorrect') {
    return { ...session, attempts, wrongAttempts: session.wrongAttempts + 1, lastCheck: check };
  }

  const currentIndex = session.currentIndex + 1;
  const finished = currentIndex >= session.questions.length;
  return {
    ...session,
    attempts,
    currentIndex,
    lastCheck: check,
    result: finished
      ? {
          difficulty: session.config.difficulty,
          questionCount: session.questions.length,
          attempts,
          wrongAttempts: session.wrongAttempts,
          accuracy: session.questions.length / attempts,
          durationMs: Math.max(0, now - session.startedAt),
        }
      : null,
  };
}
