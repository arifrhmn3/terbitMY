import { alarmStore, listSavedAlarms, occurrences } from '@/features/alarms/alarms';
import { faith } from '@/features/faith/faith';
import { nightStore } from '@/features/night/night';
import { preferences } from '@/features/settings/preferences';
import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore } from '@/services/storage/settings';

import { createPersonalisation } from './personalisation-service';
import { createPersonalisationStorage } from './storage';

/** Personalisation on the phone: answers and state in SQLite (never backed up), routines through the real stores. */
export const personalisation = createPersonalisation({
  storage: createPersonalisationStorage({
    async get(key) {
      return createSqliteSettingsStore(await getDatabase()).get(key);
    },
    async set(key, value) {
      return createSqliteSettingsStore(await getDatabase()).set(key, value);
    },
  }),
  targets: {
    alarms: alarmStore,
    night: nightStore,
    setFaith: (primary) => faith.settings.update({ primary }),
    setMobilityProfile: (mobilityProfile) => preferences.accessibility.update({ mobilityProfile }),
  },
  async existingSetup() {
    await nightStore.load();
    const [alarms, recent] = await Promise.all([listSavedAlarms(), occurrences.listRecent(1)]);
    return { alarms: alarms.length, occurrences: recent.length, nightRoutine: nightStore.getState().routine !== null };
  },
  async current() {
    const [settings, access] = await Promise.all([faith.settings.get(), preferences.accessibility.get()]);
    return { faith: settings.primary, mobilityProfile: access.mobilityProfile };
  },
});
