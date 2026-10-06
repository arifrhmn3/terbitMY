import { describe, expect, it } from '@jest/globals';

import { currentQuestion, startMathSession, submitMathAnswer, type MathSession } from './session';

function answerCurrent(session: MathSession, now = 0) {
  return submitMathAnswer(session, String(currentQuestion(session)!.answer), now);
}

describe('math mission session', () => {
  it('starts on the first question with no result', () => {
    const session = startMathSession({ difficulty: 'easy', questionCount: 3 }, 7, 1000);
    expect(session.questions).toHaveLength(3);
    expect(currentQuestion(session)).toBe(session.questions[0]);
    expect(session.result).toBeNull();
  });

  it('keeps the same question after a wrong answer (retry)', () => {
    const session = startMathSession({ difficulty: 'easy', questionCount: 3 }, 7, 0);
    const wrong = String(currentQuestion(session)!.answer + 1);

    const after = submitMathAnswer(session, wrong, 0);
    expect(after.currentIndex).toBe(0);
    expect(after.wrongAttempts).toBe(1);
    expect(after.attempts).toBe(1);
    expect(after.lastCheck).toBe('incorrect');

    const retried = answerCurrent(after);
    expect(retried.currentIndex).toBe(1);
    expect(retried.lastCheck).toBe('correct');
  });

  it('does not count invalid input as an attempt', () => {
    const session = startMathSession({ difficulty: 'easy', questionCount: 3 }, 7, 0);
    const after = submitMathAnswer(session, 'abc', 0);
    expect(after.attempts).toBe(0);
    expect(after.wrongAttempts).toBe(0);
    expect(after.currentIndex).toBe(0);
    expect(after.lastCheck).toBe('invalid');
  });

  it('completes with a result after every question is answered', () => {
    let session = startMathSession({ difficulty: 'hard', questionCount: 5 }, 99, 1_000);
    session = submitMathAnswer(session, '-1', 2_000); // one wrong attempt
    for (let i = 0; i < 5; i++) {
      session = answerCurrent(session, 31_000);
    }

    expect(currentQuestion(session)).toBeNull();
    expect(session.result).toEqual({
      difficulty: 'hard',
      questionCount: 5,
      attempts: 6,
      wrongAttempts: 1,
      accuracy: 5 / 6,
      durationMs: 30_000,
    });
  });

  it('gives perfect accuracy with no mistakes', () => {
    let session = startMathSession({ difficulty: 'medium', questionCount: 10 }, 3, 0);
    for (let i = 0; i < 10; i++) session = answerCurrent(session, 5_000);
    expect(session.result?.accuracy).toBe(1);
    expect(session.result?.wrongAttempts).toBe(0);
  });

  it('ignores answers after completion', () => {
    let session = startMathSession({ difficulty: 'easy', questionCount: 3 }, 1, 0);
    for (let i = 0; i < 3; i++) session = answerCurrent(session);
    expect(submitMathAnswer(session, '1', 0)).toBe(session);
  });
});
