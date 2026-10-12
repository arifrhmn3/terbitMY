import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore } from '@/services/storage/settings';

import { createAppPreferences } from './preferences-store';

/** Accessibility preferences, saved in SQLite on the phone. Works offline and for guests. */
export const preferences = createAppPreferences({
  async get(key) {
    return createSqliteSettingsStore(await getDatabase()).get(key);
  },
  async set(key, value) {
    return createSqliteSettingsStore(await getDatabase()).set(key, value);
  },
});
