import type { SyncStatus } from './sync-engine';

/** Plain-language sync status for the Account screen (no technical detail). */
export function syncStatusLabel(s: SyncStatus): { title: string; detail: string } {
  switch (s.state) {
    case 'local':
      return { title: 'Local only', detail: 'Your data is saved on this phone.' };
    case 'syncing':
      return { title: 'Syncing…', detail: 'Backing up your data.' };
    case 'synced':
      return {
        title: 'Synced',
        detail: s.lastSyncedAt ? `Backed up at ${new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Backed up.',
      };
    case 'offline':
      return { title: 'Offline', detail: 'Everything still works. Changes will back up when you’re online.' };
    case 'error':
      return { title: 'Sync problem', detail: 'Everything still works on this phone. Terbit MY will try again.' };
  }
}
