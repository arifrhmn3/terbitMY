import { getCloudConfig } from '@/services/cloud/config';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { createFaithServices } from './faith-services';
import { createMemoryRecitationCache } from './recitation/cache';
import { FALLBACK_TRACK_ID } from './reflection/music/catalogue';
import { musicBaseUrl } from './reflection/music/config';

/** Web preview: settings and content are kept until the page reloads; music streams. */
export const faith = createFaithServices({
  settings: createMemorySettingsStore(),
  recitationCache: createMemoryRecitationCache(),
  trackFiles: { cachedUri: async () => null, download: async (_track, url) => url },
  bundledTracks: { [FALLBACK_TRACK_ID]: require('@/assets/audio/reflection-fallback.wav') },
  musicBaseUrl: musicBaseUrl({
    musicBaseUrl: process.env.EXPO_PUBLIC_REFLECTION_MUSIC_BASE_URL,
    supabaseUrl: getCloudConfig()?.url,
  }),
});
