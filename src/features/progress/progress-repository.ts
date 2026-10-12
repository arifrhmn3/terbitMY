import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORIES, type Category } from './policy';
import type { AchievementUnlock, XpEntry, XpReason } from './progression';

/**
 * Stores what the progression engine has awarded: the XP ledger and
 * unlocked achievements. Adding is idempotent: an award or achievement that
 * already exists is skipped, so re-running the engine never doubles anything.
 */
export interface ProgressRepository {
  /** Adds the entries not stored yet. Returns the ones that were new. */
  addXp(entries: XpEntry[]): Promise<XpEntry[]>;
  /** Unlocks the achievements not unlocked yet. Returns the ones that were new. */
  unlock(unlocks: AchievementUnlock[]): Promise<AchievementUnlock[]>;
  listXp(): Promise<XpEntry[]>;
  listUnlocked(): Promise<AchievementUnlock[]>;
  /** Developer reset: removes all XP and achievements. */
  clear(): Promise<void>;
}

type XpRow = {
  award_key: string;
  occurrence_id: string | null;
  category: string | null;
  amount: number;
  reason: string;
  earned_at: number;
};

type AchievementRow = { id: string; unlocked_at: number; occurrence_id: string | null };

const REASONS: readonly XpReason[] = ['mission_completed', 'mode_bonus', 'achievement'];

function rowToXp(row: XpRow): XpEntry {
  return {
    key: row.award_key,
    occurrenceId: row.occurrence_id,
    category: CATEGORIES.includes(row.category as Category) ? (row.category as Category) : null,
    amount: row.amount,
    reason: REASONS.includes(row.reason as XpReason) ? (row.reason as XpReason) : 'mission_completed',
    earnedAt: row.earned_at,
  };
}

const rowToUnlock = (row: AchievementRow): AchievementUnlock => ({
  id: row.id,
  unlockedAt: row.unlocked_at,
  occurrenceId: row.occurrence_id,
});

type ProgressDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync' | 'execAsync'>;

export function createSqliteProgressRepository(db: ProgressDatabase, now: () => number = Date.now): ProgressRepository {
  return {
    async addXp(entries) {
      const added: XpEntry[] = [];
      for (const e of entries) {
        const { changes } = await db.runAsync(
          `INSERT OR IGNORE INTO xp_ledger (award_key, occurrence_id, category, amount, reason, earned_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          e.key,
          e.occurrenceId,
          e.category,
          e.amount,
          e.reason,
          e.earnedAt,
          now(),
        );
        if (changes === 1) added.push(e);
      }
      return added;
    },

    async unlock(unlocks) {
      const added: AchievementUnlock[] = [];
      for (const u of unlocks) {
        const { changes } = await db.runAsync(
          'INSERT OR IGNORE INTO achievements (id, unlocked_at, occurrence_id, created_at) VALUES (?, ?, ?, ?)',
          u.id,
          u.unlockedAt,
          u.occurrenceId,
          now(),
        );
        if (changes === 1) added.push(u);
      }
      return added;
    },

    async listXp() {
      return (await db.getAllAsync<XpRow>('SELECT * FROM xp_ledger ORDER BY earned_at DESC')).map(rowToXp);
    },

    async listUnlocked() {
      return (await db.getAllAsync<AchievementRow>('SELECT * FROM achievements ORDER BY unlocked_at')).map(rowToUnlock);
    },

    async clear() {
      await db.execAsync('DELETE FROM xp_ledger; DELETE FROM achievements;');
    },
  };
}

/** In-memory, with the same uniqueness rules. For tests and the web preview. */
export function createMemoryProgressRepository(): ProgressRepository {
  const xp = new Map<string, XpEntry>();
  const achievements = new Map<string, AchievementUnlock>();
  return {
    async addXp(entries) {
      return entries.filter((e) => !xp.has(e.key) && Boolean(xp.set(e.key, e)));
    },
    async unlock(unlocks) {
      return unlocks.filter((u) => !achievements.has(u.id) && Boolean(achievements.set(u.id, u)));
    },
    async listXp() {
      return [...xp.values()].sort((a, b) => b.earnedAt - a.earnedAt);
    },
    async listUnlocked() {
      return [...achievements.values()].sort((a, b) => a.unlockedAt - b.unlockedAt);
    },
    async clear() {
      xp.clear();
      achievements.clear();
    },
  };
}
