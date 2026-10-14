import { account } from '@/features/account/account';
import { getCloud } from '@/services/cloud';
import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore, type SettingsStore } from '@/services/storage/settings';

import { createCirclesStore } from './circles-store';

/** The offline copy of the Circle list lives in SQLite on the phone. */
const settings: SettingsStore = {
  async get(key) {
    return createSqliteSettingsStore(await getDatabase()).get(key);
  },
  async set(key, value) {
    return createSqliteSettingsStore(await getDatabase()).set(key, value);
  },
};

/** The signed-in user's Circles. Follows the account; fetches only when a Circles screen asks. */
export const circles = createCirclesStore({ cloud: getCloud(), account, settings });
circles.start();
