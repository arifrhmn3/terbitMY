import type { SQLiteDatabase } from 'expo-sqlite';

export type SyncEntity = 'alarm' | 'occurrence' | 'xp' | 'achievement' | 'profile';

/**
 * What has already been backed up for each account: entity ID → content
 * fingerprint at the last successful sync. Stored on the phone (migration 8).
 */
export interface SyncStateRepository {
  fingerprints(userId: string, entity: SyncEntity): Promise<Map<string, string>>;
  mark(userId: string, entity: SyncEntity, entries: { id: string; fingerprint: string }[], at: number): Promise<void>;
  forget(userId: string, entity: SyncEntity, ids: string[]): Promise<void>;
  /** When anything was last backed up for `userId` (null: never). Shown as "Last synced". */
  lastSyncedAt?(userId: string): Promise<number | null>;
}

type SyncDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'withTransactionAsync'>;

export function createSqliteSyncStateRepository(db: SyncDatabase): SyncStateRepository {
  return {
    async fingerprints(userId, entity) {
      const rows = await db.getAllAsync<{ entity_id: string; fingerprint: string }>(
        'SELECT entity_id, fingerprint FROM sync_state WHERE user_id = ? AND entity = ?',
        userId,
        entity,
      );
      return new Map(rows.map((r) => [r.entity_id, r.fingerprint]));
    },
    async mark(userId, entity, entries, at) {
      if (!entries.length) return;
      await db.withTransactionAsync(async () => {
        for (const e of entries) {
          await db.runAsync(
            'INSERT OR REPLACE INTO sync_state (user_id, entity, entity_id, fingerprint, synced_at) VALUES (?, ?, ?, ?, ?)',
            userId,
            entity,
            e.id,
            e.fingerprint,
            at,
          );
        }
      });
    },
    async forget(userId, entity, ids) {
      for (const id of ids) {
        await db.runAsync('DELETE FROM sync_state WHERE user_id = ? AND entity = ? AND entity_id = ?', userId, entity, id);
      }
    },
    async lastSyncedAt(userId) {
      const row = await db.getFirstAsync<{ at: number | null }>('SELECT MAX(synced_at) AS at FROM sync_state WHERE user_id = ?', userId);
      return row?.at ?? null;
    },
  };
}

export function createMemorySyncStateRepository(): SyncStateRepository {
  const rows = new Map<string, Map<string, string>>();
  const last = new Map<string, number>();
  const bucket = (userId: string, entity: SyncEntity) => {
    const k = `${userId}/${entity}`;
    if (!rows.has(k)) rows.set(k, new Map());
    return rows.get(k)!;
  };
  return {
    async fingerprints(userId, entity) {
      return new Map(bucket(userId, entity));
    },
    async mark(userId, entity, entries, at) {
      for (const e of entries) bucket(userId, entity).set(e.id, e.fingerprint);
      if (entries.length) last.set(userId, Math.max(last.get(userId) ?? 0, at));
    },
    async forget(userId, entity, ids) {
      for (const id of ids) bucket(userId, entity).delete(id);
    },
    async lastSyncedAt(userId) {
      return last.get(userId) ?? null;
    },
  };
}
