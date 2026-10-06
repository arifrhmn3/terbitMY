import { createRandom, type Random } from './random';

export type MathDifficulty = 'easy' | 'medium' | 'hard';
export type MathQuestionCount = 3 | 5 | 10;

export const MATH_DIFFICULTIES: readonly MathDifficulty[] = ['easy', 'medium', 'hard'];
export const MATH_QUESTION_COUNTS: readonly MathQuestionCount[] = [3, 5, 10];

export type MathQuestion = {
  /** What the user sees, e.g. "7 + 5". Uses × and ÷ for readability. */
  prompt: string;
  /** Always a whole number (never negative). */
  answer: number;
};

function add(random: Random, max: number): MathQuestion {
  const a = random.int(1, max);
  const b = random.int(1, max);
  return { prompt: `${a} + ${b}`, answer: a + b };
}

function subtract(random: Random, min: number, max: number): MathQuestion {
  const a = random.int(min, max);
  const b = random.int(1, a - 1);
  return { prompt: `${a} − ${b}`, answer: a - b };
}

function multiply(random: Random, minA: number, maxA: number, maxB: number): MathQuestion {
  const a = random.int(minA, maxA);
  const b = random.int(2, maxB);
  return { prompt: `${a} × ${b}`, answer: a * b };
}

/** Division is built from a multiplication so the answer is always whole. */
function divide(random: Random, maxDivisor: number, maxQuotient: number): MathQuestion {
  const divisor = random.int(2, maxDivisor);
  const quotient = random.int(2, maxQuotient);
  return { prompt: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
}

function multiplyThenAdd(random: Random): MathQuestion {
  const a = random.int(3, 12);
  const b = random.int(3, 12);
  const c = random.int(5, 50);
  return { prompt: `${a} × ${b} + ${c}`, answer: a * b + c };
}

const generators: Record<MathDifficulty, ((random: Random) => MathQuestion)[]> = {
  easy: [(r) => add(r, 10), (r) => subtract(r, 2, 20)],
  medium: [(r) => add(r, 99), (r) => subtract(r, 10, 99), (r) => multiply(r, 2, 9, 9)],
  hard: [
    (r) => multiply(r, 6, 19, 12),
    (r) => divide(r, 12, 12),
    multiplyThenAdd,
    (r) => subtract(r, 100, 999),
  ],
};

/**
 * Builds a list of questions. The same seed, difficulty and count always give
 * the same questions. No question repeats within one list.
 */
export function generateMathQuestions(
  difficulty: MathDifficulty,
  count: MathQuestionCount,
  seed: number,
): MathQuestion[] {
  const random = createRandom(seed);
  const questions: MathQuestion[] = [];
  const seen = new Set<string>();

  // The retry limit only matters in theory; every pool is far larger than 10.
  for (let attempt = 0; questions.length < count && attempt < count * 50; attempt++) {
    const question = random.pick(generators[difficulty])(random);
    if (!seen.has(question.prompt)) {
      seen.add(question.prompt);
      questions.push(question);
    }
  }

  return questions;
}

export type AnswerCheck = 'correct' | 'incorrect' | 'invalid';

/**
 * Checks typed input against the answer. Only whole numbers count; spaces
 * around the number are ignored. Anything else is `invalid`, so a typo such as
 * "1o" is not counted as a wrong attempt.
 */
export function checkAnswer(question: MathQuestion, input: string): AnswerCheck {
  const trimmed = input.trim();
  if (!/^-?\d+$/.test(trimmed)) return 'invalid';
  return Number(trimmed) === question.answer ? 'correct' : 'incorrect';
}
