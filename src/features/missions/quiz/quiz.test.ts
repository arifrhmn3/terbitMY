import { describe, expect, it } from '@jest/globals';

import { describeMission, type AlarmMission } from '@/features/alarms/alarm';
import { parseMission } from '@/features/alarms/alarm-repository';
import { toHistoryEntry } from '@/features/alarms/history';
import { buildMorning } from '@/features/progress/example-mornings';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { MISSION_DIFFICULTIES, MISSION_QUESTION_COUNTS, isQuizResult } from '../types';
import { BUNDLED_PACKS, bundledQuestions, createPackSource } from './packs';
import { createQuizHistory, RECENT_LIMIT } from './quiz-history';
import { selectQuestions } from './select';
import { answerQuiz, currentQuizQuestion, nextQuizQuestion, startQuizSession } from './session';
import { QUIZ_CATEGORIES, type QuizMissionConfig } from './types';

const all = BUNDLED_PACKS.flatMap((p) => p.questions);
const maxCount = Math.max(...MISSION_QUESTION_COUNTS);

describe('question packs', () => {
  it('every question is well-formed: one correct answer among four distinct choices', () => {
    for (const q of all) {
      expect(q.prompt.trim()).not.toBe('');
      expect(q.answer.trim()).not.toBe('');
      expect(q.wrong).toHaveLength(3);
      expect(new Set([q.answer, ...q.wrong]).size).toBe(4);
      expect(q.wrong).not.toContain(q.answer);
    }
  });

  it('question IDs are unique and follow the stable "<topic>-<e|m|h>-NNN" scheme', () => {
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    const prefix = { general: 'gk', geography: 'geo', vocabulary: 'voc', logic: 'log' } as const;
    for (const q of all) {
      expect(q.id).toMatch(new RegExp(`^${prefix[q.category]}-${q.difficulty[0]}-\\d{3}$`));
    }
    // IDs are referenced by history: these must never change meaning.
    expect(bundledQuestions.find('gk-e-002')?.answer).toBe('Mars');
    expect(bundledQuestions.find('geo-e-001')?.answer).toBe('Kuala Lumpur');
    expect(bundledQuestions.find('log-h-003')?.answer).toBe('5 sen');
  });

  it('every topic and difficulty has enough questions for the longest quiz', () => {
    for (const category of QUIZ_CATEGORIES) {
      for (const difficulty of MISSION_DIFFICULTIES) {
        expect(bundledQuestions.questions(category, difficulty).length).toBeGreaterThanOrEqual(maxCount);
      }
    }
  });

  it('filters by topic and difficulty', () => {
    for (const category of QUIZ_CATEGORIES) {
      for (const difficulty of MISSION_DIFFICULTIES) {
        const pool = bundledQuestions.questions(category, difficulty);
        expect(pool.every((q) => q.category === category && q.difficulty === difficulty)).toBe(true);
      }
    }
  });
});

describe('question selection', () => {
  const pool = bundledQuestions.questions('geography', 'medium');

  it('picks the requested number of different questions, with the answer among shuffled choices', () => {
    const picked = selectQuestions({ pool, count: 10, seed: 7 });
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((q) => q.id)).size).toBe(10);
    for (const q of picked) {
      expect(q.choices[q.answerIndex]).toBe(bundledQuestions.find(q.id)?.answer);
    }
  });

  it('is reproducible for a seed (the developer “fixed set”) and varies between seeds', () => {
    expect(selectQuestions({ pool, count: 5, seed: 42 })).toEqual(selectQuestions({ pool, count: 5, seed: 42 }));
    const a = selectQuestions({ pool, count: 5, seed: 1 }).map((q) => q.id);
    const b = selectQuestions({ pool, count: 5, seed: 2 }).map((q) => q.id);
    expect(a).not.toEqual(b);
  });

  it('avoids recently asked questions, and reuses the oldest ones first when it must', () => {
    const recent = pool.slice(0, 8).map((q) => q.id); // newest first
    const picked = selectQuestions({ pool, count: 5, seed: 3, recent }).map((q) => q.id);
    expect(picked.some((id) => recent.includes(id))).toBe(false);

    // Only 13 questions; 10 asked recently → 3 fresh + the 2 asked longest ago.
    const nearlyAll = pool.slice(0, 10).map((q) => q.id);
    const forced = selectQuestions({ pool, count: 5, seed: 3, recent: nearlyAll }).map((q) => q.id);
    expect(forced.filter((id) => !nearlyAll.includes(id))).toHaveLength(3);
    expect(forced.filter((id) => nearlyAll.includes(id)).sort()).toEqual([nearlyAll[9], nearlyAll[8]].sort());
  });

  it('works with any question source (future downloaded or topic packs)', () => {
    const tiny = createPackSource([
      {
        id: 'test',
        version: 1,
        title: 'Test',
        questions: [{ id: 'x-1', category: 'logic', difficulty: 'easy', prompt: '1 + 1?', answer: '2', wrong: ['1', '3', '4'] }],
      },
    ]);
    const session = startQuizSession({ config: { category: 'logic', difficulty: 'easy', questionCount: 3 }, source: tiny, seed: 1, now: 0 });
    expect(session.questions.map((q) => q.id)).toEqual(['x-1']);
  });
});

describe('quiz session', () => {
  const config: QuizMissionConfig = { category: 'general', difficulty: 'easy', questionCount: 3 };
  const start = () => startQuizSession({ config, source: bundledQuestions, seed: 99, now: 1_000 });

  it('records correct and incorrect answers, shows feedback state, and completes after the last question', () => {
    let s = start();
    const q1 = currentQuizQuestion(s)!;
    s = answerQuiz(s, q1.answerIndex); // right
    expect(s.answers[0]).toMatchObject({ questionId: q1.id, isCorrect: true });
    s = nextQuizQuestion(s, 2_000);

    const q2 = currentQuizQuestion(s)!;
    const wrong = (q2.answerIndex + 1) % q2.choices.length;
    s = answerQuiz(s, wrong);
    expect(s.answers[1]).toMatchObject({ isCorrect: false, chosen: q2.choices[wrong], correctAnswer: q2.choices[q2.answerIndex] });
    s = nextQuizQuestion(s, 3_000);

    const q3 = currentQuizQuestion(s)!;
    s = nextQuizQuestion(s, 3_500); // can't skip without answering
    expect(currentQuizQuestion(s)?.id).toBe(q3.id);
    s = answerQuiz(s, q3.answerIndex);
    s = nextQuizQuestion(s, 31_000);

    expect(s.result).toEqual({
      type: 'quiz',
      category: 'general',
      difficulty: 'easy',
      questionCount: 3,
      correctCount: 2,
      accuracy: 2 / 3,
      durationMs: 30_000,
      answers: s.answers,
    });
    expect(isQuizResult(s.result!)).toBe(true);
    expect(currentQuizQuestion(s)).toBeNull();
  });

  it('a second tap or an invalid choice changes nothing', () => {
    let s = start();
    const q = currentQuizQuestion(s)!;
    s = answerQuiz(s, 7);
    expect(s.answers).toHaveLength(0);
    s = answerQuiz(s, q.answerIndex);
    const again = answerQuiz(s, (q.answerIndex + 1) % 4);
    expect(again).toBe(s);
  });

  it('completes with any score: perfect accuracy isn’t required', () => {
    let s = start();
    while (!s.result) {
      const q = currentQuizQuestion(s)!;
      s = nextQuizQuestion(answerQuiz(s, (q.answerIndex + 1) % 4), 5_000);
    }
    expect(s.result).toMatchObject({ correctCount: 0, accuracy: 0, questionCount: 3 });
  });
});

describe('recently asked questions', () => {
  it('stores IDs newest first, without duplicates, capped', async () => {
    const history = createQuizHistory(createMemorySettingsStore());
    await history.record(['a', 'b']);
    await history.record(['c', 'a']);
    expect(await history.recent()).toEqual(['a', 'c', 'b']);
    await history.record(Array.from({ length: RECENT_LIMIT + 50 }, (_, i) => `q${i}`));
    expect(await history.recent()).toHaveLength(RECENT_LIMIT);
  });
});

describe('quiz alarms are stored like any mission', () => {
  it('a quiz mission round-trips through storage; bad data falls back to the default', () => {
    const mission: AlarmMission = { type: 'quiz', category: 'vocabulary', difficulty: 'hard', questionCount: 5 };
    expect(parseMission(JSON.stringify(mission))).toEqual(mission);
    expect(parseMission(JSON.stringify({ ...mission, category: 'astrology' })).type).toBe('math');
    expect(parseMission(JSON.stringify({ ...mission, questionCount: 7 })).type).toBe('math');
    // Existing maths alarms are untouched.
    const math: AlarmMission = { type: 'math', difficulty: 'medium', questionCount: 10 };
    expect(parseMission(JSON.stringify(math))).toEqual(math);
  });

  it('is described and shown in history in plain language', () => {
    expect(describeMission({ type: 'quiz', category: 'general', difficulty: 'medium', questionCount: 5 })).toBe(
      'General Knowledge · Medium · 5 questions',
    );
    expect(describeMission({ type: 'math', difficulty: 'easy', questionCount: 3 })).toBe('Maths · Easy · 3 questions');
    const o = buildMorning({
      id: 'q1',
      scheduledAt: Date.UTC(2026, 9, 12, 22, 30),
      outcome: 'completed',
      mission: { type: 'quiz', category: 'logic', difficulty: 'easy', questionCount: 5 },
    });
    expect(toHistoryEntry(o).completion).toMatch(/4\/5 correct$/);
  });
});
