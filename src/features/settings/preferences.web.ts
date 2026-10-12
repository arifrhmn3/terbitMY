import { createMemorySettingsStore } from '@/services/storage/settings';

import { createAppPreferences } from './preferences-store';

/** Web preview: kept until the page reloads. */
export const preferences = createAppPreferences(createMemorySettingsStore());
