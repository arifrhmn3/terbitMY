import type { DayKey } from '@/features/progress/day';

/**
 * DEVELOPER-ONLY switches for testing Faith missions (Alarms → Practice in a
 * development build). In production builds `__DEV__` is false and every
 * switch is ignored.
 */
export type FaithDevOverrides = {
  /** Pretend there's no internet: remote content and music can't be fetched. */
  forceOffline: boolean;
  /** Always play the bundled fallback track. */
  forceFallbackMusic: boolean;
  /** Treat this date as "today" (choose a test date / daily assignment). */
  date: DayKey | null;
};

let overrides: FaithDevOverrides = { forceOffline: false, forceFallbackMusic: false, date: null };
const listeners = new Set<() => void>();

const enabled = () => typeof __DEV__ !== 'undefined' && __DEV__;

export const faithDev = {
  get(): FaithDevOverrides {
    return overrides;
  },
  set(change: Partial<FaithDevOverrides>) {
    overrides = { ...overrides, ...change };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  offline: () => enabled() && overrides.forceOffline,
  fallbackMusic: () => enabled() && overrides.forceFallbackMusic,
  date: () => (enabled() ? overrides.date : null),
};
