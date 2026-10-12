import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore } from '@/services/storage/settings';

import { createQuizHistory } from './quiz-history';

/** Recently asked quiz questions, saved on the phone (works offline). */
export const quizHistory = createQuizHistory({
  async get(key) {
    return createSqliteSettingsStore(await getDatabase()).get(key);
  },
  async set(key, value) {
    return createSqliteSettingsStore(await getDatabase()).set(key, value);
  },
});
