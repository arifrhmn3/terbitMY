import type { MissionDifficulty } from '../../types';
import type { QuizCategory, QuizPack, QuizQuestion } from '../types';

import { GENERAL_KNOWLEDGE_PACK } from './general-knowledge';
import { GEOGRAPHY_PACK } from './geography';
import { LOGIC_PACK } from './logic';
import { VOCABULARY_PACK } from './vocabulary';

/** Packs bundled with the app (always available offline). */
export const BUNDLED_PACKS: readonly QuizPack[] = [GENERAL_KNOWLEDGE_PACK, GEOGRAPHY_PACK, VOCABULARY_PACK, LOGIC_PACK];

/**
 * Where questions come from. The mission engine only asks for the pool for a
 * category and difficulty, so downloaded, topic-specific or age-adapted packs
 * can be added later as another source without changing the engine.
 */
export interface QuestionSource {
  questions(category: QuizCategory, difficulty: MissionDifficulty): QuizQuestion[];
  find(id: string): QuizQuestion | null;
}

export function createPackSource(packs: readonly QuizPack[] = BUNDLED_PACKS): QuestionSource {
  const all = packs.flatMap((p) => p.questions);
  const byId = new Map(all.map((question) => [question.id, question]));
  return {
    questions: (category, difficulty) => all.filter((x) => x.category === category && x.difficulty === difficulty),
    find: (id) => byId.get(id) ?? null,
  };
}

/** The app's question source: the bundled packs. */
export const bundledQuestions = createPackSource();
