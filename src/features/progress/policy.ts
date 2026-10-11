import type { AlarmMission, CompletionMode } from '@/features/alarms/alarm';

/**
 * PROVISIONAL PROGRESSION POLICY. Every number and rule that turns mornings
 * into XP, streaks, ranks and achievements lives here, so beta testing can
 * change them without touching screens or stored mornings. Nothing here is
 * final. XP already earned stays in the ledger when values change; streaks,
 * ranks and summaries are recalculated from the morning history.
 */

/** The three disciplines. Maths counts as Education; Fitness and Faith missions come later. */
export type Category = 'education' | 'fitness' | 'faith';

export const CATEGORIES: readonly Category[] = ['education', 'fitness', 'faith'];

export const CATEGORY_LABEL: Record<Category, string> = {
  education: 'Education',
  fitness: 'Fitness',
  faith: 'Faith',
};

export type MissionType = Exclude<AlarmMission['type'], 'none'>;

/** What an achievement measures. */
export type AchievementMetric =
  /** Mornings that earned a reward (mission completed). */
  | 'successful_mornings'
  /** Missions completed, in any mode. */
  | 'missions_completed'
  /** Missions completed in Challenge mode. */
  | 'challenge_completions'
  /** Consecutive streak days reached (at any point). */
  | 'streak_days';

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  metric: AchievementMetric;
  threshold: number;
  /** Extra XP when unlocked (counts toward total XP only, not a discipline). */
  bonusXp: number;
};

export type StreakPolicy = {
  /**
   * The longest run of calendar days without any morning that a streak may
   * span. `null`: days without a due alarm never break a streak (weekends
   * off, holidays without alarms).
   */
  maxGapDays: number | null;
};

export type ProgressionPolicy = {
  /** Which discipline each mission type trains. */
  missionCategory: Record<MissionType, Category>;
  /** XP for completing a mission, by mission type. */
  missionXp: Record<MissionType, number>;
  /** Extra XP for completing the mission, by the mode the alarm actually rang with. */
  modeBonusXp: Record<CompletionMode, number>;
  streak: StreakPolicy;
  /** Minimum XP for each rank, ascending (index 0 = Rank 1). */
  overallRankThresholds: readonly number[];
  categoryRankThresholds: readonly number[];
  achievements: readonly AchievementDefinition[];
};

export const PROGRESSION_POLICY: ProgressionPolicy = {
  missionCategory: { math: 'education' },
  missionXp: { math: 10 },
  modeBonusXp: { reward: 0, gentle: 0, challenge: 5 },
  streak: { maxGapDays: null },
  overallRankThresholds: [0, 50, 150, 300, 600, 1000, 2000],
  categoryRankThresholds: [0, 30, 100, 250, 500, 1000],
  achievements: [
    {
      id: 'first_morning',
      title: 'First successful morning',
      description: 'Complete your first morning mission.',
      metric: 'successful_mornings',
      threshold: 1,
      bonusXp: 0,
    },
    {
      id: 'streak_3',
      title: '3-day streak',
      description: 'Succeed on 3 mornings in a row.',
      metric: 'streak_days',
      threshold: 3,
      bonusXp: 10,
    },
    {
      id: 'streak_7',
      title: '7-day streak',
      description: 'Succeed on 7 mornings in a row.',
      metric: 'streak_days',
      threshold: 7,
      bonusXp: 25,
    },
    {
      id: 'missions_10',
      title: '10 missions completed',
      description: 'Complete 10 morning missions.',
      metric: 'missions_completed',
      threshold: 10,
      bonusXp: 0,
    },
    {
      id: 'first_challenge',
      title: 'First Challenge completed',
      description: 'Complete a mission in Challenge mode.',
      metric: 'challenge_completions',
      threshold: 1,
      bonusXp: 0,
    },
  ],
};
