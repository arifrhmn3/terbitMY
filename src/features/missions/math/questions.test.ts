import { describe, expect, it } from '@jest/globals';

import {
  checkAnswer,
  generateMathQuestions,
  MATH_DIFFICULTIES,
  MATH_QUESTION_COUNTS,
  type AnswerCheck,
  type MathQuestion,
} from './questions';

/** Independently evaluates a prompt such as "7 × 8 + 12" or "144 ÷ 12". */
function evaluate(prompt: string): number {
  const tokens = prompt.split(' ');
  const value = (i: number) => Number(tokens[i]);
  const apply = (a: number, op: string, b: number) => {
    switch (op) {
      case '+':
        return a + b;
      case '−':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return a / b;
      default:
        throw new Error(`Unknown operator ${op}`);
    }
  };
  // Hard questions only ever use "a × b + c", so left-to-right is correct.
  let result = value(0);
  for (let i = 1; i < tokens.length; i += 2) {
    result = apply(result, tokens[i], value(i + 1));
  }
  return result;
}

describe('generateMathQuestions', () => {
  it('is deterministic for the same seed', () => {
    expect(generateMathQuestions('medium', 10, 42)).toEqual(generateMathQuestions('medium', 10, 42));
  });

  it('changes with the seed', () => {
    expect(generateMathQuestions('medium', 10, 1)).not.toEqual(generateMathQuestions('medium', 10, 2));
  });

  for (const difficulty of MATH_DIFFICULTIES) {
    for (const count of MATH_QUESTION_COUNTS) {
      it(`${difficulty}: makes ${count} unique questions with correct whole-number answers`, () => {
        for (let seed = 0; seed < 200; seed++) {
          const questions = generateMathQuestions(difficulty, count, seed);
          expect(questions).toHaveLength(count);
          expect(new Set(questions.map((q) => q.prompt)).size).toBe(count);
          for (const q of questions) {
            expect(Number.isInteger(q.answer)).toBe(true);
            expect(q.answer).toBeGreaterThanOrEqual(0);
            expect(evaluate(q.prompt)).toBe(q.answer);
          }
        }
      });
    }
  }

  it('keeps easy questions small and free of × and ÷', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const q of generateMathQuestions('easy', 10, seed)) {
        expect(q.prompt).toMatch(/^\d+ [+−] \d+$/);
        expect(q.answer).toBeLessThanOrEqual(20);
      }
    }
  });

  it('uses harder operations on hard', () => {
    const prompts = Array.from({ length: 20 }, (_, seed) => generateMathQuestions('hard', 10, seed))
      .flat()
      .map((q) => q.prompt)
      .join(' ');
    expect(prompts).toContain('×');
    expect(prompts).toContain('÷');
  });
});

describe('checkAnswer', () => {
  const question: MathQuestion = { prompt: '7 + 5', answer: 12 };

  const cases: [string, AnswerCheck][] = [
    ['12', 'correct'],
    [' 12 ', 'correct'],
    ['012', 'correct'],
    ['13', 'incorrect'],
    ['-12', 'incorrect'],
    ['', 'invalid'],
    ['   ', 'invalid'],
    ['12.0', 'invalid'],
    ['1o', 'invalid'],
    ['twelve', 'invalid'],
    ['1 2', 'invalid'],
  ];

  it.each(cases)('"%s" is %s', (input, expected) => {
    expect(checkAnswer(question, input)).toBe(expected);
  });
});
