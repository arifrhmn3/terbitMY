import { AppState } from 'react-native';

import { alarmStore, handOff, listSavedAlarms, occurrences } from '@/features/alarms/alarms';
import { faith } from '@/features/faith/faith';
import { progress } from '@/features/progress/progress';
import { getCloud } from '@/services/cloud';
import { getDatabase } from '@/services/storage/database';

import { createSyncEngine } from './sync-engine';
import { createSqliteSyncStateRepository } from './sync-state-repository';

const cloud = getCloud();

/** The app's cloud backup. Does nothing (state 'local') without an account or a configured cloud. */
export const syncEngine = createSyncEngine({
  local: {
    alarms: listSavedAlarms,
    occurrences: () => occurrences.listSince(0),
    xp: async () => (await progress.ledger()).xp,
    achievements: async () => (await progress.ledger()).unlocked,
    // Private: backed up to the user's own profile only (see features/faith/privacy.ts).
    privateProfile: async () => ({ faithPreference: (await faith.settings.get()).primary }),
  },
  store: cloud?.store ?? null,
  state: {
    fingerprints: async (...args) => createSqliteSyncStateRepository(await getDatabase()).fingerprints(...args),
    mark: async (...args) => createSqliteSyncStateRepository(await getDatabase()).mark(...args),
    forget: async (...args) => createSqliteSyncStateRepository(await getDatabase()).forget(...args),
    lastSyncedAt: async (userId) => createSqliteSyncStateRepository(await getDatabase()).lastSyncedAt!(userId),
  },
  currentUser: async () => (cloud ? cloud.auth.currentUser() : null),
});

/** Waits after a local change, so a burst of writes becomes one sync. */
const DEBOUNCE_MS = 2000;
/** Retry delays after a failed sync (offline or error), then every 15 minutes. */
const RETRY_MS = [30_000, 60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000];

let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

/** Asks for a sync soon. Safe to call often; does nothing for guests. */
export function requestSync(delayMs = DEBOUNCE_MS) {
  if (!cloud) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncEngine.sync().catch(() => {});
  }, delayMs);
}

let started = false;

/**
 * Starts background sync triggers: app comes to the front, alarms change,
 * new XP or achievements, and retries with back-off after a failure. Local
 * writes never wait for any of this.
 */
export function startCloudSync() {
  if (!cloud || started) return;
  started = true;
  syncEngine.subscribe((s) => {
    if (s.state === 'synced' || s.state === 'local') failures = 0;
    if (s.state === 'offline' || s.state === 'error' || s.state === 'signin_required') {
      requestSync(RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
      failures += 1;
    }
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      failures = 0;
      requestSync(0);
    }
  });
  const changed = () => {
    syncEngine.markChanged();
    requestSync();
  };
  alarmStore.subscribe(changed);
  progress.subscribe(changed);
  faith.settings.subscribe(changed);
  // Alarm hand-off runs record fired, stopped and dismissed mornings.
  handOff.subscribe(changed);
  requestSync(0);
}
