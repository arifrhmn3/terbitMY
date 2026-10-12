import { evaluateMorning } from '@/features/alarms/accountability';
import { missionDifficulty } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';

import { daysBetween, type DayKey, type DayKeyFn } from './day';
import {
  CATEGORIES,
  type AchievementDefinition,
  type AchievementMetric,
  type Category,
  type ProgressionPolicy,
} from './policy';

/**
 * The progression rules, as pure functions over the morning history
 * (alarm occurrences). Eligibility always comes from Phase 1's
 * `evaluateMorning` / `isRewardEligible` / `isStreakEligible`, never from raw
 * statuses, and each morning's `completionMode` is the mode it really rang
 * with (already adjusted for the user's entitlement).
 */

// ── XP ───────────────────────────────────────────────────────────────────────

export type XpReason = 'mission_completed' | 'mode_bonus' | 'achievement';

/** One line of the XP ledger. `key` is unique: the same award can never be stored twice. */
export type XpEntry = {
  key: string;
  occurrenceId: string | null;
  /** The discipline it counts toward; null = total XP only (e.g. achievement bonuses). */
  category: Category | null;
  amount: number;
  reason: XpReason;
  /** When it was earned (the mission's completion time). */
  earnedAt: number;
};

/** When a morning's reward was earned. */
export function earnedAt(o: AlarmOccurrence): number {
  return o.missionCompletedAt ?? o.endedAt ?? o.scheduledAt;
}

/** The XP one morning earns under `policy`. Empty unless it is reward-eligible and has a mission. */
export function xpForMorning(o: AlarmOccurrence, policy: ProgressionPolicy): XpEntry[] {
  if (o.mission.type === 'none' || !evaluateMorning(o).rewardEligible) return [];
  const category = policy.missionCategory[o.mission.type];
  const at = earnedAt(o);
  const entries: XpEntry[] = [];
  const difficulty = missionDifficulty(o.mission);
  const base = policy.missionXp[o.mission.type] + (difficulty ? policy.difficultyBonusXp[difficulty] : 0);
  if (base > 0) {
    entries.push({ key: `occ:${o.id}:mission`, occurrenceId: o.id, category, amount: base, reason: 'mission_completed', earnedAt: at });
  }
  const bonus = policy.modeBonusXp[o.completionMode];
  if (bonus > 0) {
    entries.push({ key: `occ:${o.id}:mode_bonus`, occurrenceId: o.id, category, amount: bonus, reason: 'mode_bonus', earnedAt: at });
  }
  return entries;
}

export function achievementXp(unlock: AchievementUnlock, definition: AchievementDefinition): XpEntry | null {
  if (definition.bonusXp <= 0) return null;
  return {
    key: `ach:${unlock.id}`,
    occurrenceId: unlock.occurrenceId,
    category: null,
    amount: definition.bonusXp,
    reason: 'achievement',
    earnedAt: unlock.unlockedAt,
  };
}

// ── Streak days ──────────────────────────────────────────────────────────────

/**
 * How one morning affects its day:
 * - success: streak-eligible (mission completed under the current policy);
 * - pending: still open, so the day isn't decided yet;
 * - failed: finished without success (missed, dismissed, stopped and never done);
 * - neutral: cancelled (alarm deleted or turned off before it rang), or an
 *   alarm without a mission that was simply turned off.
 */
export type MorningVerdict = 'success' | 'pending' | 'failed' | 'neutral';

export function morningVerdict(o: AlarmOccurrence): MorningVerdict {
  if (o.status === 'cancelled') return 'neutral';
  const e = evaluateMorning(o);
  if (e.streakEligible) return 'success';
  if (!e.finished) return 'pending';
  if (e.morningComplete) return 'neutral';
  return 'failed';
}

export type DayResult = {
  day: DayKey;
  verdict: MorningVerdict;
  /** The day's first successful morning (for achievement links). */
  firstSuccess: AlarmOccurrence | null;
};

/**
 * "Mornings": occurrences of the Main Wake-Up Alarm, as recorded when each
 * fired (`isMainWakeUp`). Evening or daytime alarms are never mornings: they
 * earn XP and count in general accountability, but never touch morning
 * counters or the morning streak.
 */
export function mainWakeUps(history: AlarmOccurrence[]): AlarmOccurrence[] {
  return history.filter((o) => o.isMainWakeUp);
}

/** The morning streak's days: Main Wake-Up occurrences only, by local calendar day. */
export function morningDays(history: AlarmOccurrence[], dayKey: DayKeyFn): DayResult[] {
  return dayResults(mainWakeUps(history), dayKey);
}

/**
 * THE STREAK DAY RULE. Occurrences are grouped by the local calendar day they
 * were due (the morning streak passes Main Wake-Up occurrences only). A day is:
 * - a success if ANY of them succeeded (so it adds at most one streak day,
 *   even if the main alarm changed that day);
 * - otherwise pending while any of them is still open;
 * - otherwise failed if any failed;
 * - otherwise neutral. Neutral days, and days with no main alarm due,
 *   neither extend nor break a streak.
 */
export function dayResults(history: AlarmOccurrence[], dayKey: DayKeyFn): DayResult[] {
  const byDay = new Map<DayKey, AlarmOccurrence[]>();
  for (const o of [...history].sort((a, b) => a.scheduledAt - b.scheduledAt)) {
    const day = dayKey(o.scheduledAt);
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }
  const rank: Record<MorningVerdict, number> = { success: 3, pending: 2, failed: 1, neutral: 0 };
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, mornings]) => {
      const verdicts = mornings.map(morningVerdict);
      const verdict = verdicts.reduce((best, v) => (rank[v] > rank[best] ? v : best), 'neutral' as MorningVerdict);
      const firstSuccess = mornings.find((_, i) => verdicts[i] === 'success') ?? null;
      return { day, verdict, firstSuccess };
    });
}

export type StreakSummary = {
  current: number;
  longest: number;
  lastSuccessfulDay: DayKey | null;
};

type StreakStep = { day: DayResult; run: number };

/** Walks the days in order, yielding the running streak after each success day. */
function walkStreak(days: DayResult[], maxGapDays: number | null): { steps: StreakStep[]; run: number; last: DayKey | null } {
  let run = 0;
  let last: DayKey | null = null;
  const steps: StreakStep[] = [];
  for (const day of days) {
    if (day.verdict === 'failed') run = 0;
    if (day.verdict !== 'success') continue;
    if (maxGapDays !== null && last !== null && daysBetween(last, day.day) - 1 > maxGapDays) run = 0;
    run += 1;
    last = day.day;
    steps.push({ day, run });
  }
  return { steps, run, last };
}

export function streaks(days: DayResult[], today: DayKey, policy: ProgressionPolicy): StreakSummary {
  const { maxGapDays } = policy.streak;
  const { steps, run, last } = walkStreak(days, maxGapDays);
  const expired = maxGapDays !== null && last !== null && daysBetween(last, today) - 1 > maxGapDays;
  return {
    current: expired ? 0 : run,
    longest: steps.reduce((max, s) => Math.max(max, s.run), 0),
    lastSuccessfulDay: last,
  };
}

// ── Ranks ────────────────────────────────────────────────────────────────────

export type Rank = {
  /** 1-based. */
  level: number;
  /** Placeholder until rank names are decided. */
  label: string;
  /** XP needed for the next rank, or null at the top rank. */
  nextAt: number | null;
};

export function rankFor(xp: number, thresholds: readonly number[]): Rank {
  let level = 1;
  thresholds.forEach((min, i) => {
    if (xp >= min) level = i + 1;
  });
  return { level, label: `Rank ${level}`, nextAt: thresholds[level] ?? null };
}

// ── Achievements ─────────────────────────────────────────────────────────────

export type AchievementUnlock = {
  id: string;
  unlockedAt: number;
  /** The occurrence that reached the threshold. */
  occurrenceId: string | null;
};

/**
 * Every achievement the history has reached, with the occurrence that
 * reached it. Data-driven: add a definition to the policy to add one.
 * Morning metrics (successful mornings, streak days) use Main Wake-Up
 * occurrences only; mission metrics use every alarm.
 */
export function reachedAchievements(history: AlarmOccurrence[], dayKey: DayKeyFn, policy: ProgressionPolicy): AchievementUnlock[] {
  // The occurrences at which each metric reached 1, 2, 3, … in order.
  const reachedAt: Record<AchievementMetric, AlarmOccurrence[]> = {
    successful_mornings: [],
    missions_completed: [],
    challenge_completions: [],
    streak_days: [],
  };
  const finished = history.filter((o) => evaluateMorning(o).finished).sort((a, b) => earnedAt(a) - earnedAt(b));
  for (const o of finished) {
    if (o.isMainWakeUp && morningVerdict(o) === 'success') reachedAt.successful_mornings.push(o);
    if (evaluateMorning(o).missionOutcome === 'completed') {
      reachedAt.missions_completed.push(o);
      if (o.completionMode === 'challenge') reachedAt.challenge_completions.push(o);
    }
  }
  // Streak length n is first reached on the n-th entry here.
  for (const { day, run } of walkStreak(morningDays(history, dayKey), policy.streak.maxGapDays).steps) {
    if (run > reachedAt.streak_days.length && day.firstSuccess) reachedAt.streak_days.push(day.firstSuccess);
  }

  return policy.achievements.flatMap((a) => {
    // A discipline filter (e.g. "first Fitness mission") narrows mission metrics to that discipline.
    const list = a.category
      ? reachedAt[a.metric].filter((o) => o.mission.type !== 'none' && policy.missionCategory[o.mission.type] === a.category)
      : reachedAt[a.metric];
    const o = list[a.threshold - 1];
    return o ? [{ id: a.id, unlockedAt: earnedAt(o), occurrenceId: o.id }] : [];
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

export type RankTrack = 'overall' | Category;

/** Success/failure counts. Pending, cancelled and neutral occurrences count on neither side. */
export type Tally = { successful: number; scheduled: number };

function tally(occurrences: AlarmOccurrence[]): Tally {
  const verdicts = occurrences.map(morningVerdict);
  return {
    successful: verdicts.filter((v) => v === 'success').length,
    scheduled: verdicts.filter((v) => v === 'success' || v === 'failed').length,
  };
}

/**
 * Four separate kinds of statistic:
 * 1. morning accountability: Main Wake-Up occurrences only;
 * 2. general accountability: every alarm (morning, evening, any time);
 * 3. discipline XP (Education / Fitness / Faith);
 * 4. total XP = discipline XP + general/bonus XP (achievement bonuses, which
 *    belong to no discipline). `xp.total` always equals that sum.
 */
export type ProgressSummary = {
  morning: Tally & { streak: StreakSummary };
  general: Tally & { missionsCompleted: number; challengeCompletions: number };
  xp: {
    total: number;
    byCategory: Record<Category, number>;
    /** XP not tied to a discipline (achievement bonuses). */
    general: number;
  };
  ranks: Record<RankTrack, Rank>;
  achievements: { definition: AchievementDefinition; unlock: AchievementUnlock | null }[];
  /** Newest first. */
  recentXp: XpEntry[];
};

export function xpTotals(ledger: XpEntry[]): ProgressSummary['xp'] {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let general = 0;
  for (const entry of ledger) {
    if (entry.category) byCategory[entry.category] += entry.amount;
    else general += entry.amount;
  }
  return { total: CATEGORIES.reduce((sum, c) => sum + byCategory[c], general), byCategory, general };
}

export function summarise(params: {
  history: AlarmOccurrence[];
  ledger: XpEntry[];
  unlocked: AchievementUnlock[];
  policy: ProgressionPolicy;
  dayKey: DayKeyFn;
  now: number;
  recentLimit?: number;
}): ProgressSummary {
  const { history, ledger, unlocked, policy, dayKey, now, recentLimit = 10 } = params;
  const xp = xpTotals(ledger);
  const completed = history.filter((o) => evaluateMorning(o).missionOutcome === 'completed');
  return {
    morning: {
      ...tally(mainWakeUps(history)),
      streak: streaks(morningDays(history, dayKey), dayKey(now), policy),
    },
    general: {
      ...tally(history),
      missionsCompleted: completed.length,
      challengeCompletions: completed.filter((o) => o.completionMode === 'challenge').length,
    },
    xp,
    ranks: {
      overall: rankFor(xp.total, policy.overallRankThresholds),
      ...(Object.fromEntries(CATEGORIES.map((c) => [c, rankFor(xp.byCategory[c], policy.categoryRankThresholds)])) as Record<
        Category,
        Rank
      >),
    },
    achievements: policy.achievements.map((definition) => ({
      definition,
      unlock: unlocked.find((u) => u.id === definition.id) ?? null,
    })),
    recentXp: [...ledger].sort((a, b) => b.earnedAt - a.earnedAt).slice(0, recentLimit),
  };
}
