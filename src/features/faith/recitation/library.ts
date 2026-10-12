import type { DayKey } from '@/features/progress/day';

import { FAITH_POLICY } from '../policy';
import { addDays } from '../schedule';
import { withTimeout } from '../timeout';
import type { FaithTradition } from '../types';
import type { RecitationCache } from './cache';
import type { ProviderRegistry } from './content';
import { dailyRecitation, type RecitationRef, type RecitationScheduleSet } from './schedule';
import type { DailyRecitationAssignment, RecitationPassage } from './types';

export type OpenedRecitation = {
  passage: RecitationPassage;
  /** Today's canonical assignment; null only when no schedule covers the date. */
  assignment: DailyRecitationAssignment | null;
  /** True when the local fallback passage stands in for the daily one. */
  usedFallback: boolean;
};

export type ArchiveOpen =
  | ({ status: 'ok'; fromCache: boolean } & OpenedRecitation)
  /** Future dates can't be opened. */
  | { status: 'future' }
  | { status: 'not_scheduled' }
  /** Not on the phone and couldn't be fetched (offline, or the source failed). */
  | { status: 'unavailable'; assignment: DailyRecitationAssignment };

export type PrepareOutcome = 'cached' | 'already_cached' | 'failed' | 'not_scheduled';


/**
 * Daily Recitations, offline first.
 *
 * - Alarm missions (`forMission`) NEVER touch the network: today's passage
 *   comes from the phone (cache, or a provider that ships in the app), else
 *   the approved local fallback for that tradition. The user can always
 *   complete the alarm.
 * - `prepare` fetches today's/tomorrow's passage ahead of time and caches it.
 * - The archive (`open`) may fetch a past date (with a timeout) and caches
 *   what it fetches. Future dates are refused.
 */
export function createRecitationLibrary(deps: {
  providers: ProviderRegistry;
  fallback: Record<FaithTradition, RecitationRef>;
  cache: RecitationCache;
  schedules: () => Promise<RecitationScheduleSet>;
  today: () => DayKey;
  now?: () => number;
  timeoutMs?: number;
}) {
  const { providers, fallback, cache, schedules, today, now = Date.now, timeoutMs = FAITH_POLICY.networkTimeoutMs } = deps;

  async function assignment(tradition: FaithTradition, date: DayKey) {
    return dailyRecitation(await schedules(), tradition, date);
  }

  /** From the phone only: the cache, or a provider that ships inside the app. */
  async function fromPhone(ref: RecitationRef): Promise<RecitationPassage | null> {
    const cached = await cache.get(ref.provider, ref.contentId);
    if (cached) return cached;
    const provider = providers[ref.provider];
    if (provider?.local) return provider.getPassage(ref.contentId).catch(() => null);
    return null;
  }

  async function fetchAndCache(ref: RecitationRef): Promise<RecitationPassage | null> {
    const provider = providers[ref.provider];
    if (!provider) return null;
    try {
      const passage = await withTimeout(provider.getPassage(ref.contentId), timeoutMs);
      if (passage && !provider.local) await cache.put(passage, now());
      return passage;
    } catch {
      return null;
    }
  }

  return {
    assignment,

    /** For the alarm mission: today's passage from the phone, else the local fallback. Never waits on the network. */
    async forMission(tradition: FaithTradition): Promise<OpenedRecitation> {
      const daily = await assignment(tradition, today());
      const passage = daily ? await fromPhone(daily) : null;
      if (passage) return { passage, assignment: daily, usedFallback: false };
      const local = await fromPhone(fallback[tradition]);
      if (!local) throw new Error(`No local fallback passage for ${tradition}.`);
      return { passage: local, assignment: daily, usedFallback: true };
    },

    /** Fetches and caches a day's passage ahead of time (today, or tomorrow for an early alarm). */
    async prepare(tradition: FaithTradition, date: DayKey = today()): Promise<PrepareOutcome> {
      if (date > addDays(today(), 1)) return 'not_scheduled';
      const daily = await assignment(tradition, date);
      if (!daily) return 'not_scheduled';
      if (await fromPhone(daily)) return 'already_cached';
      return (await fetchAndCache(daily)) ? 'cached' : 'failed';
    },

    /** Archive and today's reading: from the phone, else fetched (and cached). Future dates are refused. */
    async open(tradition: FaithTradition, date: DayKey): Promise<ArchiveOpen> {
      if (date > today()) return { status: 'future' };
      const daily = await assignment(tradition, date);
      if (!daily) return { status: 'not_scheduled' };
      const local = await fromPhone(daily);
      if (local) return { status: 'ok', fromCache: true, passage: local, assignment: daily, usedFallback: false };
      const fetched = await fetchAndCache(daily);
      if (fetched) return { status: 'ok', fromCache: false, passage: fetched, assignment: daily, usedFallback: false };
      return { status: 'unavailable', assignment: daily };
    },

    /** Whether a day's passage can be opened offline. */
    async isOnPhone(tradition: FaithTradition, date: DayKey): Promise<boolean> {
      const daily = await assignment(tradition, date);
      return daily ? (await fromPhone(daily)) !== null : false;
    },

    /** Past dates for the archive, newest first (today included, never the future). */
    archiveDates(days: number): DayKey[] {
      const t = today();
      return Array.from({ length: days }, (_, i) => addDays(t, -i));
    },
  };
}

export type RecitationLibrary = ReturnType<typeof createRecitationLibrary>;
