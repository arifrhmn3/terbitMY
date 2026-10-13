import type { SyncStatus } from './sync-engine';

/** "14:05" today, otherwise "12 Oct, 14:05". */
export function formatLastSynced(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

/**
 * Plain-language sync status for the Account screen. Never shows technical
 * errors (those are only in the developer panel).
 */
export function syncStatusLabel(s: SyncStatus, now: number = Date.now()): { title: string; detail: string } {
  const last = s.lastSyncedAt ? ` Last synced ${formatLastSynced(s.lastSyncedAt, now)}.` : '';
  switch (s.state) {
    case 'local':
      return { title: 'Local only', detail: 'Your data is saved on this phone.' };
    case 'pending':
      return { title: 'Sync pending', detail: `New changes will back up in a moment.${last}` };
    case 'syncing':
      return { title: 'Syncing…', detail: 'Backing up your data.' };
    case 'synced':
      return { title: 'Synced', detail: s.lastSyncedAt ? `Last synced ${formatLastSynced(s.lastSyncedAt, now)}.` : 'Backed up.' };
    case 'offline':
      return {
        title: 'Offline',
        detail: `Everything still works. ${s.pending > 0 ? `${changes(s.pending)} will back up` : 'Changes will back up'} when you’re online.${last}`,
      };
    case 'signin_required':
      return {
        title: 'Sign-in required',
        detail: `Backup is paused until your sign-in is confirmed. Terbit MY will try again; if this stays, sign out and sign in again. Everything on this phone is kept.${last}`,
      };
    case 'error':
      return { title: 'Sync failed', detail: `Everything still works on this phone. Terbit MY will try again.${last}` };
  }
}
