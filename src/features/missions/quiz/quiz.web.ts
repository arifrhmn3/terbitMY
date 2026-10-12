import { createMemorySettingsStore } from '@/services/storage/settings';

import { createQuizHistory } from './quiz-history';

/** Web preview: recent questions are remembered until the page reloads. */
export const quizHistory = createQuizHistory(createMemorySettingsStore());
