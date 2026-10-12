import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { alarmStore, listSavedAlarms } from '@/features/alarms/alarms';

import { faith } from './faith';
import { faithDev } from './faith-dev';
import { primaryTradition } from './faith-settings';
import type { FaithSettings, FaithTradition } from './types';

/** The user's Faith settings (loads them on first use). */
export function useFaithSettings(): FaithSettings {
  useEffect(() => {
    faith.settings.get().catch(() => {});
  }, []);
  return useSyncExternalStore(faith.settings.subscribe, faith.settings.current, faith.settings.current);
}

export function useFaithDev() {
  return useSyncExternalStore(faithDev.subscribe, faithDev.get, faithDev.get);
}

/** Traditions to keep ready offline: the user's own, plus any used by enabled Recitation alarms. */
async function traditionsInUse(): Promise<FaithTradition[]> {
  const [settings, alarms] = await Promise.all([faith.settings.get(), listSavedAlarms()]);
  const fromAlarms = alarms.flatMap((a) => (a.enabled && a.mission.type === 'recitation' ? [a.mission.tradition] : []));
  const own = primaryTradition(settings);
  return own ? [own, ...fromAlarms] : fromAlarms;
}

const MIN_INTERVAL_MS = 10 * 60_000;
let lastRun = 0;
let soon: ReturnType<typeof setTimeout> | null = null;

/** After alarms or settings change: once things settle, not on every keystroke. */
function prepareSoon() {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    prepare(true);
  }, 3000);
}

function prepare(force = false) {
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return;
  lastRun = Date.now();
  traditionsInUse()
    .then((traditions) => faith.prepareAhead(traditions))
    .catch(() => {});
}

/**
 * Keeps today's and tomorrow's Faith content (Recitation text, Reflection
 * music) on the phone, so alarm missions work offline: at start-up, when the
 * app comes to the front, and when alarms change. Call once from the root layout.
 */
export function useFaithPrefetch() {
  useEffect(() => {
    prepare(true);
    const app = AppState.addEventListener('change', (state) => state === 'active' && prepare());
    const alarms = alarmStore.subscribe(prepareSoon);
    const settings = faith.settings.subscribe(prepareSoon);
    return () => {
      app.remove();
      alarms();
      settings();
    };
  }, []);
}
