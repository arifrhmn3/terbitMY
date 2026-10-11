import { occurrences } from '@/features/alarms/alarms';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { createProgressEngine } from './progress-engine';
import { createMemoryProgressRepository } from './progress-repository';

const repository = createMemoryProgressRepository();

/* Web preview only: progress is kept in memory and lost when the page reloads. Phones use SQLite (progress.ts). */
export const progress = createProgressEngine({
  history: occurrences,
  repository: async () => repository,
  settings: createMemorySettingsStore(),
});
