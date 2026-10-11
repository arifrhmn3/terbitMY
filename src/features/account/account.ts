import { useEffect, useSyncExternalStore } from 'react';

import { requestSync, startCloudSync, syncEngine } from '@/features/sync/sync';
import type { SyncStatus } from '@/features/sync/sync-engine';
import { getCloud } from '@/services/cloud';

import { createAccountStore } from './account-store';

/** The app's optional account. Signing in backs up this phone's existing data; signing out keeps it. */
export const account = createAccountStore({
  cloud: getCloud(),
  onSignedIn: () => requestSync(0),
  onSignedOut: () => syncEngine.reset(),
});

/** Restores the session and starts background sync. Call once from the root layout. */
export function useCloudStartup() {
  useEffect(() => {
    account.start().catch(() => {});
    startCloudSync();
  }, []);
}

export function useAccount() {
  return useSyncExternalStore(account.subscribe, account.getState, account.getState);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus, syncEngine.getStatus);
}
