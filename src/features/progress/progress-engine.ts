import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import type { SettingsStore } from '@/services/storage/settings';

import { localDayKey, type DayKeyFn } from './day';
import { PROGRESSION_POLICY, type ProgressionPolicy } from './policy';
import type { ProgressRepository } from './progress-repository';
import {
  achievementXp,
  reachedAchievements,
  summarise,
  xpForMorning,
  type AchievementUnlock,
  type ProgressSummary,
  type XpEntry,
} from './progression';

/** Mornings due before this time are ignored (moved forward by the developer reset). */
const HISTORY_START_KEY = 'progress.historyStart.v1';

export type Awarded = { xp: XpEntry[]; achievements: AchievementUnlock[] };

/**
 * Turns the morning history into stored XP and achievements, and builds the
 * progress summary. Runs entirely on the phone.
 *
 * `sync()` is safe to run any number of times (after a mission, on resume,
 * when the Progress tab opens): every award has a unique key in the
 * database, so a morning can never earn XP twice and an achievement unlocks
 * once. Runs are serialised; concurrent callers share one.
 */
export function createProgressEngine(deps: {
  history: { listSince(since: number): Promise<AlarmOccurrence[]> };
  repository: () => Promise<ProgressRepository>;
  settings: SettingsStore;
  policy?: ProgressionPolicy;
  now?: () => number;
  dayKey?: DayKeyFn;
}) {
  const { history, repository, settings, policy = PROGRESSION_POLICY, now = Date.now, dayKey = localDayKey } = deps;
  let running: Promise<Awarded> | null = null;
  const listeners = new Set<(awarded: Awarded) => void>();

  async function historyStart() {
    return (await settings.get<number>(HISTORY_START_KEY)) ?? 0;
  }

  async function loadHistory() {
    return history.listSince(await historyStart());
  }

  async function run(): Promise<Awarded> {
    const occurrences = await loadHistory();
    const repo = await repository();
    const xp = await repo.addXp(occurrences.flatMap((o) => xpForMorning(o, policy)));
    const achievements = await repo.unlock(reachedAchievements(occurrences, dayKey, policy));
    // From every unlocked achievement (not just new ones), so a bonus is never lost if a run stops halfway.
    const bonuses = (await repo.listUnlocked()).flatMap((u) => {
      const definition = policy.achievements.find((a) => a.id === u.id);
      const entry = definition ? achievementXp(u, definition) : null;
      return entry ? [entry] : [];
    });
    const awarded = { xp: [...xp, ...(await repo.addXp(bonuses))], achievements };
    if (awarded.xp.length || awarded.achievements.length) listeners.forEach((l) => l(awarded));
    return awarded;
  }

  function sync(): Promise<Awarded> {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    sync,
    /** Brings awards up to date, then summarises everything for the Progress tab. */
    async summary(): Promise<ProgressSummary> {
      await sync();
      const repo = await repository();
      return summarise({
        history: await loadHistory(),
        ledger: await repo.listXp(),
        unlocked: await repo.listUnlocked(),
        policy,
        dayKey,
        now: now(),
      });
    },
    /** DEVELOPER DIAGNOSTICS: the whole XP ledger (newest first) and unlocked achievements. */
    async ledger(): Promise<{ xp: XpEntry[]; unlocked: AchievementUnlock[] }> {
      const repo = await repository();
      return { xp: await repo.listXp(), unlocked: await repo.listUnlocked() };
    },
    /** XP earned by one morning (for its "Morning complete" screen). */
    async xpForOccurrence(occurrenceId: string): Promise<XpEntry[]> {
      await sync();
      return (await (await repository()).listXp()).filter((e) => e.occurrenceId === occurrenceId && e.reason !== 'achievement');
    },
    /** Called when a run awards something new. Returns an unsubscribe function. */
    subscribe(listener: (awarded: Awarded) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * DEVELOPER TOOL: clears XP and achievements and starts counting from
     * `from` (default now). Mornings before it stay in history but no longer
     * count toward progress.
     */
    async reset(from: number = now()) {
      await running?.catch(() => {});
      await (await repository()).clear();
      await settings.set(HISTORY_START_KEY, from);
    },
    historyStart,
    policy,
  };
}

export type ProgressEngine = ReturnType<typeof createProgressEngine>;
