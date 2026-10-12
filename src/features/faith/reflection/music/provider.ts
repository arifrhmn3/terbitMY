import { FAITH_POLICY } from '../../policy';
import { withTimeout } from '../../timeout';
import type { PlayableSource, ReflectionTrack, ResolvedTrack, TrackId } from './types';

/** Audio files saved on the phone (the app's cache folder). */
export type TrackFileStore = {
  /** The saved file's URI, if this track is on the phone. */
  cachedUri(track: ReflectionTrack): Promise<string | null>;
  /** Downloads and saves the track; returns the local URI. */
  download(track: ReflectionTrack, url: string): Promise<string>;
};

/**
 * Turns a Terbit track ID into something playable. The source (bundled,
 * Supabase Storage today; a stock or commissioned catalogue later) can be
 * swapped without touching the Reflection mission or the daily schedule.
 */
export type ReflectionMusicProvider = {
  metadata(trackId: TrackId): ReflectionTrack | null;
  /**
   * The best playable source now. Never throws. With `network: false` (alarm
   * missions) it never touches the network; with `network: true` it waits
   * at most the timeout, then falls back.
   */
  resolve(trackId: TrackId, opts: { network: boolean; purpose: 'today' | 'archive' }): Promise<ResolvedTrack>;
  /** Downloads and caches a track ahead of time, only if its licence allows local caching. */
  prefetch(trackId: TrackId): Promise<'cached' | 'already_available' | 'not_permitted' | 'failed'>;
  isAvailableOffline(trackId: TrackId): Promise<boolean>;
};


/**
 * Resolution order (docs/REFLECTION-MUSIC.md):
 *   1. bundled with the app, or already cached on the phone;
 *   2. download + cache, if the licence permits caching (network allowed);
 *   3. stream, if the licence permits streaming (archive only);
 *   4. the bundled fallback track.
 */
export function createReflectionMusicProvider(deps: {
  catalogue: readonly ReflectionTrack[];
  fallbackTrackId: TrackId;
  /** `require()`d audio for tracks that ship inside the app. */
  bundled: Record<TrackId, PlayableSource>;
  files: TrackFileStore;
  /** Where a remote track can be fetched, or null when no remote source is configured. */
  remoteUrl: (track: ReflectionTrack) => string | null;
  timeoutMs?: number;
  /** Developer tool: always play the fallback. */
  forceFallback?: () => boolean;
}): ReflectionMusicProvider {
  const { catalogue, fallbackTrackId, bundled, files, remoteUrl, timeoutMs = FAITH_POLICY.networkTimeoutMs } = deps;
  const byId = new Map(catalogue.map((t) => [t.id, t]));

  function fallback(requestedTrackId: TrackId): ResolvedTrack {
    const track = byId.get(fallbackTrackId);
    const source = bundled[fallbackTrackId];
    if (!track || source === undefined) throw new Error('The bundled fallback track is missing.');
    return { track, requestedTrackId, source, kind: 'fallback' };
  }

  async function onPhone(track: ReflectionTrack): Promise<ResolvedTrack | null> {
    if (bundled[track.id] !== undefined && track.licence.offlineBundlingPermitted) {
      return { track, requestedTrackId: track.id, source: bundled[track.id], kind: 'bundled' };
    }
    const uri = await files.cachedUri(track).catch(() => null);
    return uri ? { track, requestedTrackId: track.id, source: { uri }, kind: 'cache' } : null;
  }

  return {
    metadata: (trackId) => byId.get(trackId) ?? null,

    async resolve(trackId, { network, purpose }) {
      const track = byId.get(trackId);
      if (!track || deps.forceFallback?.()) return fallback(trackId);
      const local = await onPhone(track);
      if (local) return local;
      const url = network ? remoteUrl(track) : null;
      if (url && track.licence.localCachingPermitted) {
        try {
          const uri = await withTimeout(files.download(track, url), timeoutMs);
          return { track, requestedTrackId: trackId, source: { uri }, kind: 'download' };
        } catch {
          // fall through: stream (archive) or fallback
        }
      }
      if (url && purpose === 'archive' && track.licence.streamingPermitted) {
        return { track, requestedTrackId: trackId, source: { uri: url }, kind: 'stream' };
      }
      return fallback(trackId);
    },

    async prefetch(trackId) {
      const track = byId.get(trackId);
      if (!track) return 'failed';
      if (await onPhone(track)) return 'already_available';
      if (!track.licence.localCachingPermitted) return 'not_permitted';
      const url = remoteUrl(track);
      if (!url) return 'failed';
      try {
        await withTimeout(files.download(track, url), timeoutMs * 6);
        return 'cached';
      } catch {
        return 'failed';
      }
    },

    async isAvailableOffline(trackId) {
      const track = byId.get(trackId);
      return track ? (await onPhone(track)) !== null : false;
    },
  };
}
