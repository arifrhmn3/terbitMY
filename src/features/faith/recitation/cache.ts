import type { SQLiteDatabase } from 'expo-sqlite';

import type { RecitationPassage } from './types';

/** Passages stored on the phone, exactly as their source provided them. */
export type RecitationCache = {
  get(provider: string, contentId: string): Promise<RecitationPassage | null>;
  put(passage: RecitationPassage, now: number): Promise<void>;
};

/** FNV-1a over the passage's text fields, to detect any change to stored text. */
export function passageChecksum(passage: RecitationPassage): string {
  let hash = 0x811c9dc5;
  const text = [
    passage.reference,
    ...passage.sections.flatMap((s) => [s.number, s.original ?? '', s.transliteration ?? '', s.translation ?? '']),
  ].join('\u0000');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

type CacheDatabase = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

export function createSqliteRecitationCache(db: CacheDatabase): RecitationCache {
  return {
    async get(provider, contentId) {
      const row = await db.getFirstAsync<{ body: string; checksum: string }>(
        'SELECT body, checksum FROM faith_content_cache WHERE provider = ? AND content_id = ?',
        provider,
        contentId,
      );
      if (!row) return null;
      try {
        const passage = JSON.parse(row.body) as RecitationPassage;
        // Never show text that no longer matches what the source gave us.
        return passageChecksum(passage) === row.checksum ? passage : null;
      } catch {
        return null;
      }
    },
    async put(passage, now) {
      await db.runAsync(
        'INSERT OR REPLACE INTO faith_content_cache (provider, content_id, body, checksum, cached_at) VALUES (?, ?, ?, ?, ?)',
        passage.provider,
        passage.contentId,
        JSON.stringify(passage),
        passageChecksum(passage),
        now,
      );
    },
  };
}

export function createMemoryRecitationCache(): RecitationCache & { clear(): void } {
  const rows = new Map<string, string>();
  const key = (provider: string, contentId: string) => `${provider}\u0000${contentId}`;
  return {
    async get(provider, contentId) {
      const raw = rows.get(key(provider, contentId));
      return raw === undefined ? null : (JSON.parse(raw) as RecitationPassage);
    },
    async put(passage) {
      rows.set(key(passage.provider, passage.contentId), JSON.stringify(passage));
    },
    clear() {
      rows.clear();
    },
  };
}
