import type { Alarm } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import type { AchievementUnlock, XpEntry } from '@/features/progress/progression';
import { CloudError, type CloudStore, type CloudUser } from '@/services/cloud/types';

import { achievementToCloud, alarmToCloud, fingerprint, occurrenceToCloud, xpToCloud } from './mapping';
import type { SyncEntity, SyncStateRepository } from './sync-state-repository';

/** The phone's canonical records, read fresh for every sync. */
export type LocalSource = {
  alarms(): Promise<Alarm[]>;
  occurrences(): Promise<AlarmOccurrence[]>;
  xp(): Promise<XpEntry[]>;
  achievements(): Promise<AchievementUnlock[]>;
  /**
   * Private profile settings chosen on the phone (Faith preference). Null
   * fields are not sent, so a new phone never clears a choice made elsewhere.
   */
  privateProfile?(): Promise<{ faithPreference: string | null }>;
};

/**
 * - local: no account (or no cloud in this build); everything stays on the phone;
 * - pending: something changed on the phone and will be backed up shortly;
 * - syncing / synced;
 * - offline: no connection; changes wait and are retried;
 * - signin_required: the cloud didn't accept the sign-in; changes wait and are retried;
 * - error: something else went wrong; changes wait and are retried.
 */
export type SyncState = 'local' | 'pending' | 'syncing' | 'synced' | 'offline' | 'signin_required' | 'error';

export type SyncStatus = {
  state: SyncState;
  userId: string | null;
  /** Local records not backed up yet (as of the last check). */
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
};

type Batch = { entity: SyncEntity; rows: { id: string; row: unknown; fingerprint: string }[] };

const CHUNK = 200;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Backs up the phone's records to the signed-in user's cloud account.
 *
 * Local first: screens and the progression engine write to SQLite as before
 * and never wait for this. A record is pending until its current content has
 * been sent for the current account (see `sync_state`), so anything written
 * offline, or while a sync failed, is simply sent next time: there is no
 * separate queue to lose. Every cloud write is idempotent, so re-sending is
 * always safe. Runs are serialised; a request during a run queues one more.
 */
export function createSyncEngine(deps: {
  local: LocalSource;
  store: CloudStore | null;
  state: SyncStateRepository;
  currentUser: () => Promise<CloudUser | null>;
  now?: () => number;
}) {
  const { local, store, state, currentUser, now = Date.now } = deps;
  let status: SyncStatus = { state: 'local', userId: null, pending: 0, lastSyncedAt: null, lastError: null };
  const listeners = new Set<(s: SyncStatus) => void>();
  let running: Promise<SyncStatus> | null = null;
  let queued: Promise<SyncStatus> | null = null;

  function set(next: Partial<SyncStatus>) {
    status = { ...status, ...next };
    listeners.forEach((l) => l(status));
  }

  /** What still has to be sent for `userId`, per entity, plus alarms deleted on the phone. */
  async function plan(userId: string): Promise<{ batches: Batch[]; deletedAlarmIds: string[] }> {
    const [alarms, occurrences, xp, achievements, profile] = await Promise.all([
      local.alarms(),
      local.occurrences(),
      local.xp(),
      local.achievements(),
      local.privateProfile?.() ?? null,
    ]);
    const sources: { entity: SyncEntity; rows: { id: string; row: unknown }[] }[] = [
      { entity: 'alarm', rows: alarms.map((a) => ({ id: a.id, row: alarmToCloud(a) })) },
      { entity: 'occurrence', rows: occurrences.map((o) => ({ id: o.id, row: occurrenceToCloud(o) })) },
      { entity: 'xp', rows: xp.map((e) => ({ id: e.key, row: xpToCloud(e) })) },
      { entity: 'achievement', rows: achievements.map((u) => ({ id: u.id, row: achievementToCloud(u) })) },
      {
        entity: 'profile',
        rows: profile?.faithPreference ? [{ id: 'me', row: { faithPreference: profile.faithPreference } }] : [],
      },
    ];
    const batches: Batch[] = [];
    let deletedAlarmIds: string[] = [];
    for (const source of sources) {
      const synced = await state.fingerprints(userId, source.entity);
      const rows = source.rows
        .map((r) => ({ ...r, fingerprint: fingerprint(r.row) }))
        .filter((r) => synced.get(r.id) !== r.fingerprint);
      batches.push({ entity: source.entity, rows });
      if (source.entity === 'alarm') {
        const present = new Set(source.rows.map((r) => r.id));
        deletedAlarmIds = [...synced.keys()].filter((id) => !present.has(id));
      }
    }
    return { batches, deletedAlarmIds };
  }

  const pendingIn = (p: { batches: Batch[]; deletedAlarmIds: string[] }) =>
    p.batches.reduce((n, b) => n + b.rows.length, 0) + p.deletedAlarmIds.length;

  async function push(cloud: CloudStore, userId: string, batch: Batch) {
    for (const part of chunks(batch.rows)) {
      const rows = part.map((r) => r.row);
      switch (batch.entity) {
        case 'alarm':
          await cloud.pushAlarms(rows as never);
          break;
        case 'occurrence':
          await cloud.pushOccurrences(rows as never);
          break;
        case 'xp':
          await cloud.pushXp(rows as never);
          break;
        case 'achievement':
          await cloud.pushAchievements(rows as never);
          break;
        case 'profile':
          for (const row of rows) await cloud.upsertProfile(userId, row as { faithPreference: string });
          break;
      }
      // Only after the cloud accepted them.
      await state.mark(userId, batch.entity, part, now());
    }
  }

  async function run(): Promise<SyncStatus> {
    const user = store ? await currentUser() : null;
    if (!store || !user) {
      set({ state: 'local', userId: null, pending: 0, lastError: null });
      return status;
    }
    if (status.userId !== user.id) {
      // A restart (or another account): show when this account last backed up.
      const last = await state.lastSyncedAt?.(user.id).catch(() => null);
      set({ userId: user.id, lastSyncedAt: last ?? null, lastError: null });
    }
    const work = await plan(user.id);
    set({ state: 'syncing', pending: pendingIn(work) });
    try {
      // Alarms first, then the events that refer to them.
      await push(store, user.id, work.batches[0]);
      if (work.deletedAlarmIds.length) {
        await store.deleteAlarms(work.deletedAlarmIds, now());
        await state.forget(user.id, 'alarm', work.deletedAlarmIds);
      }
      for (const batch of work.batches.slice(1)) await push(store, user.id, batch);
      // With nothing to send the cloud wasn't contacted: keep the time of the last real backup.
      const sent = pendingIn(work) > 0;
      set({ state: 'synced', pending: 0, lastSyncedAt: sent || status.lastSyncedAt === null ? now() : status.lastSyncedAt, lastError: null });
    } catch (error) {
      const remaining = pendingIn(await plan(user.id).catch(() => work));
      const kind = error instanceof CloudError ? error.kind : 'server';
      set({
        state: kind === 'offline' ? 'offline' : kind === 'auth' ? 'signin_required' : 'error',
        pending: remaining,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
    return status;
  }

  function sync(): Promise<SyncStatus> {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
      return running;
    }
    // Something changed during a run: sync once more afterwards.
    queued ??= running.then(() => {
      queued = null;
      return sync();
    });
    return queued;
  }

  return {
    sync,
    getStatus: () => status,
    /** A local change is waiting for the next sync ("Sync pending"). Only changes what's shown. */
    markChanged() {
      if (status.state === 'synced') set({ state: 'pending' });
    },
    subscribe(listener: (s: SyncStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** How many local records still need backing up for `userId` (developer diagnostics). */
    async pendingCount(userId: string) {
      return pendingIn(await plan(userId));
    },
    /** After sign-out: show "Local only". Nothing local is deleted. */
    reset() {
      set({ state: 'local', userId: null, pending: 0, lastSyncedAt: null, lastError: null });
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
