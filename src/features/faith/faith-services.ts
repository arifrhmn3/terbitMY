import { localDayKey, type DayKey } from '@/features/progress/day';
import type { SettingsStore } from '@/services/storage/settings';

import { faithDev } from './faith-dev';
import { createFaithSettingsStore } from './faith-settings';
import type { RecitationCache } from './recitation/cache';
import {
  createDevBundledProvider,
  createDevRemoteProvider,
  DEV_BUNDLED_PROVIDER_ID,
  DEV_FALLBACK_CONTENT_ID,
  DEV_REMOTE_PROVIDER_ID,
} from './recitation/content';
import { createRecitationLibrary } from './recitation/library';
import {
  BUNDLED_RECITATION_SCHEDULE,
  initialRecitationSchedules,
  type RecitationRef,
  type RecitationScheduleSet,
} from './recitation/schedule';
import { FALLBACK_TRACK_ID, PLACEHOLDER_CATALOGUE, REMOTE_PROVIDER_ID } from './reflection/music/catalogue';
import { createReflectionMusicProvider, type TrackFileStore } from './reflection/music/provider';
import type { PlayableSource, TrackId } from './reflection/music/types';
import {
  BUNDLED_REFLECTION_SCHEDULE,
  dailyReflection,
  initialReflectionSchedule,
  type ReflectionDayValue,
} from './reflection/schedule';
import {
  logSessionStart,
  pickReflection,
  REFLECTION_SESSIONS_KEY,
  startedOn,
  type ReflectionChoice,
  type ReflectionPick,
  type ReflectionSessionLog,
} from './reflection/sessions';
import { addDays, applySchedule, type ScheduleLayers } from './schedule';
import { FAITH_TRADITIONS, perTradition, type FaithTradition } from './types';

export const FAITH_SCHEDULES_KEY = 'faith.schedules';

type StoredSchedules = { recitation: RecitationScheduleSet; reflection: ScheduleLayers<ReflectionDayValue> };

/**
 * Faith missions for the app: settings, the Recitation library, Reflection
 * music and the daily schedules. Platform pieces (storage, files, bundled
 * audio) are passed in, so this is the same on the phone, the web preview
 * and in tests.
 */
export function createFaithServices(deps: {
  settings: SettingsStore;
  recitationCache: RecitationCache;
  trackFiles: TrackFileStore;
  bundledTracks: Record<TrackId, PlayableSource>;
  musicBaseUrl: string | null;
  now?: () => number;
}) {
  const { settings, recitationCache, trackFiles, bundledTracks, musicBaseUrl, now = Date.now } = deps;
  const faithSettings = createFaithSettingsStore(settings);

  /** The local calendar date (same day logic as Progress), or a developer test date. */
  const today = (): DayKey => faithDev.date() ?? localDayKey(now());

  let loading: Promise<StoredSchedules> | null = null;

  /**
   * The schedule history saved on the phone, plus any newer schedule bundled
   * with this app version. A newer schedule only applies after tomorrow, so
   * past assignments never change.
   */
  async function schedules(): Promise<StoredSchedules> {
    loading ??= (async () => {
      const stored = await settings.get<StoredSchedules>(FAITH_SCHEDULES_KEY);
      const base: StoredSchedules = stored ?? { recitation: initialRecitationSchedules(), reflection: initialReflectionSchedule() };
      const day = localDayKey(now());
      const merged: StoredSchedules = {
        recitation: perTradition((t) => applySchedule(base.recitation[t], BUNDLED_RECITATION_SCHEDULE[t], day)),
        reflection: applySchedule(base.reflection, BUNDLED_REFLECTION_SCHEDULE, day),
      };
      if (!stored || JSON.stringify(merged) !== JSON.stringify(stored)) await settings.set(FAITH_SCHEDULES_KEY, merged);
      return merged;
    })().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  }

  const providers = {
    [DEV_BUNDLED_PROVIDER_ID]: createDevBundledProvider(),
    // Development stand-in for a remote source; answers only when "online".
    [DEV_REMOTE_PROVIDER_ID]: createDevRemoteProvider(() => !faithDev.offline()),
  };

  const recitation = createRecitationLibrary({
    providers,
    fallback: perTradition((t): RecitationRef => ({ provider: DEV_BUNDLED_PROVIDER_ID, contentId: DEV_FALLBACK_CONTENT_ID[t] })),
    cache: recitationCache,
    schedules: async () => (await schedules()).recitation,
    today,
    now,
  });

  const music = createReflectionMusicProvider({
    catalogue: PLACEHOLDER_CATALOGUE,
    fallbackTrackId: FALLBACK_TRACK_ID,
    bundled: bundledTracks,
    files: trackFiles,
    remoteUrl: (track) =>
      track.provider === REMOTE_PROVIDER_ID && musicBaseUrl && !faithDev.offline()
        ? `${musicBaseUrl}/${track.externalAssetId}`
        : null,
    forceFallback: faithDev.fallbackMusic,
  });

  /** The canonical Reflection for a date (prefetching, developer status). */
  async function reflectionFor(date: DayKey) {
    return dailyReflection((await schedules()).reflection, date);
  }

  /** The session to run now: today's canonical Reflection first, then fresh alternates for later sessions today. */
  async function nextReflection(): Promise<ReflectionPick> {
    const date = today();
    const log = await settings.get<ReflectionSessionLog>(REFLECTION_SESSIONS_KEY);
    return pickReflection((await schedules()).reflection, date, startedOn(log, date));
  }

  /** Called when a session starts, so the next session today is a different one. */
  async function recordReflectionStart(date: DayKey, choice: ReflectionChoice) {
    const log = await settings.get<ReflectionSessionLog>(REFLECTION_SESSIONS_KEY);
    await settings.set(REFLECTION_SESSIONS_KEY, logSessionStart(log, date, choice));
  }

  /**
   * Gets today's and tomorrow's content onto the phone ahead of time, so
   * alarm missions work offline. Best effort; failures just mean the
   * bundled fallbacks are used.
   */
  async function prepareAhead(traditions: readonly FaithTradition[]) {
    const days = [today(), addDays(today(), 1)];
    const wanted = [...new Set(traditions)].filter((t) => FAITH_TRADITIONS.includes(t));
    await Promise.all(
      days.flatMap((d) => [
        ...wanted.map((t) => recitation.prepare(t, d).catch(() => 'failed' as const)),
        reflectionFor(d).then((r) => music.prefetch(r.trackId)).catch(() => 'failed' as const),
      ]),
    );
  }

  return {
    settings: faithSettings,
    recitation,
    music,
    today,
    reflectionFor,
    nextReflection,
    recordReflectionStart,
    prepareAhead,
    schedules,
  };
}

export type FaithServices = ReturnType<typeof createFaithServices>;
