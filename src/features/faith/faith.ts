import { getCloudConfig } from '@/services/cloud/config';
import { createFileCache } from '@/services/file-cache';
import { getDatabase } from '@/services/storage/database';
import { createSqliteSettingsStore } from '@/services/storage/settings';

import { createFaithServices } from './faith-services';
import { createSqliteRecitationCache } from './recitation/cache';
import { FALLBACK_TRACK_ID } from './reflection/music/catalogue';
import { musicBaseUrl } from './reflection/music/config';

const files = createFileCache('reflection-music');

/** Faith missions on the phone: settings and content in SQLite, music in the cache folder. Works offline. */
export const faith = createFaithServices({
  settings: {
    async get(key) {
      return createSqliteSettingsStore(await getDatabase()).get(key);
    },
    async set(key, value) {
      return createSqliteSettingsStore(await getDatabase()).set(key, value);
    },
  },
  recitationCache: {
    async get(provider, contentId) {
      return createSqliteRecitationCache(await getDatabase()).get(provider, contentId);
    },
    async put(passage, now) {
      return createSqliteRecitationCache(await getDatabase()).put(passage, now);
    },
  },
  trackFiles: {
    cachedUri: (track) => files.uri(track.externalAssetId),
    download: (track, url) => files.download(url, track.externalAssetId),
  },
  bundledTracks: { [FALLBACK_TRACK_ID]: require('@/assets/audio/reflection-fallback.wav') },
  musicBaseUrl: musicBaseUrl({
    musicBaseUrl: process.env.EXPO_PUBLIC_REFLECTION_MUSIC_BASE_URL,
    supabaseUrl: getCloudConfig()?.url,
  }),
});
