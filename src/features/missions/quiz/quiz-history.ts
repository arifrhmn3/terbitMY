import type { SettingsStore } from '@/services/storage/settings';

const KEY = 'quiz.recentQuestionIds.v1';
/** About the last month of 10-question quizzes; old IDs fall off the end. */
export const RECENT_LIMIT = 300;

/** Question IDs asked recently (newest first), so new quizzes avoid repeats. Saved on the phone. */
export function createQuizHistory(settings: SettingsStore) {
  return {
    async recent(): Promise<string[]> {
      return (await settings.get<string[]>(KEY)) ?? [];
    },
    async record(ids: readonly string[]) {
      const previous = (await settings.get<string[]>(KEY)) ?? [];
      const next = [...[...ids].reverse(), ...previous.filter((id) => !ids.includes(id))].slice(0, RECENT_LIMIT);
      await settings.set(KEY, next);
    },
  };
}

export type QuizHistory = ReturnType<typeof createQuizHistory>;
