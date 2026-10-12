import type { MissionDifficulty } from '@/features/missions/types';

/**
 * PROVISIONAL FAITH MISSION POLICY. Prototype values, to be tuned after beta
 * testing without touching screens or stored data.
 */
export const FAITH_POLICY = {
  recitation: {
    /** Daily Recitation length the curators aim for, in minutes. */
    targetMinutes: { min: 12, max: 20 },
    /** Acceptable range for a daily passage. */
    acceptableMinutes: { min: 10, max: 30 },
    /** Hard ceiling: never schedule anything longer. */
    maxMinutes: 30,
    /** Reading speeds used to estimate a session when a curator hasn't. Words per minute. */
    wordsPerMinute: { original: 50, transliteration: 80, translation: 160 },
    /** Time to move between sections. */
    secondsPerSection: 4,
  },
  reflection: {
    /** Session length by difficulty (difficulty = duration, not intellectual difficulty), in seconds. */
    durationSec: { easy: 45, medium: 120, hard: 240 } satisfies Record<MissionDifficulty, number>,
    /** The allowed range for each difficulty, for checks and later tuning. */
    rangeSec: {
      easy: { min: 30, max: 60 },
      medium: { min: 60, max: 180 },
      hard: { min: 180, max: 300 },
    } satisfies Record<MissionDifficulty, { min: number; max: number }>,
    /** How many guided prompts each length shows (between settling in and the closing intention). */
    promptCount: { easy: 1, medium: 2, hard: 3 } satisfies Record<MissionDifficulty, number>,
    /** Share of the session for settling in before the first prompt, and for the closing intention. */
    settlingShare: 0.15,
    closingShare: 0.15,
  },
  /** The longest an archive fetch may wait before giving up. Alarm missions never wait on the network. */
  networkTimeoutMs: 5000,
} as const;
