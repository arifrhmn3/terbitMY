import { alarmStore, listSavedAlarms, occurrences } from '@/features/alarms/alarms';
import { faith } from '@/features/faith/faith';
import { nightStore } from '@/features/night/night';
import { preferences } from '@/features/settings/preferences';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { createPersonalisation } from './personalisation-service';
import { createPersonalisationStorage } from './storage';

/** Web preview: kept until the page reloads (like alarms on web). */
export const personalisation = createPersonalisation({
  storage: createPersonalisationStorage(createMemorySettingsStore()),
  targets: {
    alarms: alarmStore,
    night: nightStore,
    setFaith: (primary) => faith.settings.update({ primary }),
    setMobilityProfile: (mobilityProfile) => preferences.accessibility.update({ mobilityProfile }),
  },
  async existingSetup() {
    const [alarms, recent] = await Promise.all([listSavedAlarms(), occurrences.listRecent(1)]);
    return { alarms: alarms.length, occurrences: recent.length, nightRoutine: false };
  },
  async current() {
    const [settings, access] = await Promise.all([faith.settings.get(), preferences.accessibility.get()]);
    return { faith: settings.primary, mobilityProfile: access.mobilityProfile };
  },
});
