import { account } from '@/features/account/account';
import { getCloud } from '@/services/cloud';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { createCirclesStore } from './circles-store';

/** Web preview: the offline copy is kept in memory only. */
export const circles = createCirclesStore({ cloud: getCloud(), account, settings: createMemorySettingsStore() });
circles.start();
