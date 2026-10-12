import { createRandom, type Random } from '../math/random';

import type { QuizQuestion } from './types';

/** A question ready to show: choices in a fixed (shuffled) order. */
export type PreparedQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string | null;
};

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks `count` different questions from `pool`, preferring ones not asked
 * recently. `recent` is newest first: when the pool runs short, the
 * questions asked longest ago come back first. The same seed and inputs
 * always give the same questions and choice order (testable, reproducible).
 */
export function selectQuestions(params: {
  pool: readonly QuizQuestion[];
  count: number;
  seed: number;
  recent?: readonly string[];
}): PreparedQuestion[] {
  const { pool, count, seed, recent = [] } = params;
  const random = createRandom(seed);
  const age = new Map(recent.map((id, i) => [id, i]));
  const fresh = shuffled(
    pool.filter((x) => !age.has(x.id)),
    random,
  );
  // Asked before: oldest first (largest index in `recent`).
  const repeats = pool.filter((x) => age.has(x.id)).sort((a, b) => age.get(b.id)! - age.get(a.id)!);
  return [...fresh, ...repeats].slice(0, count).map((x) => {
    const choices = shuffled([x.answer, ...x.wrong], random);
    return {
      id: x.id,
      prompt: x.prompt,
      choices,
      answerIndex: choices.indexOf(x.answer),
      explanation: x.explanation ?? null,
    };
  });
}
