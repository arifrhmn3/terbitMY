import { occurrences } from '@/features/alarms/alarms';
import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore, type SettingsStore } from '@/services/storage/settings';

import { createProgressEngine } from './progress-engine';
import { createSqliteProgressRepository } from './progress-repository';

const settings: SettingsStore = {
  async get(key) {
    return createSqliteSettingsStore(await getDatabase()).get(key);
  },
  async set(key, value) {
    return createSqliteSettingsStore(await getDatabase()).set(key, value);
  },
};

/** The app's progression engine: XP, streaks, ranks and achievements, saved in SQLite on the phone. */
export const progress = createProgressEngine({
  history: occurrences,
  repository: async () => createSqliteProgressRepository(await getDatabase()),
  settings,
});
