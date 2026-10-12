import type { DayKey } from '@/features/progress/day';

import type { FaithTradition } from '../types';

/**
 * Review state of a piece of religious content. Only `approved` content may
 * ship in a public release (see docs/FAITH-CONTENT.md).
 *   draft → source_verified (matches the trusted source word for word)
 *         → reviewed (checked by a qualified reviewer) → approved
 */
export type ReviewStatus = 'draft' | 'source_verified' | 'reviewed' | 'approved';

/**
 * One unit of a passage (a verse, or a numbered line). Every text field is
 * stored and shown EXACTLY as the trusted source provides it: Terbit never
 * paraphrases, shortens, merges or corrects religious text.
 */
export type RecitationSection = {
  /** Verse/line number as the source numbers it, e.g. "1" or "2:255". */
  number: string;
  original: string | null;
  transliteration: string | null;
  translation: string | null;
};

export type RecitationPassage = {
  /** Stable ID within its provider; the daily schedule points at this forever. */
  contentId: string;
  provider: string;
  tradition: FaithTradition;
  /** Citation shown to the user, e.g. "Surah Al-Fatihah 1:1–7". */
  reference: string;
  title: string;
  originalLanguage: string | null;
  /** Writing direction of the original text. */
  direction: 'ltr' | 'rtl';
  /** Name of the translation/transliteration editions, as the source names them. */
  translationName: string | null;
  transliterationName: string | null;
  /** Where the text comes from (shown with the passage). */
  sourceCitation: string;
  sections: RecitationSection[];
  /** Optional recitation audio (metadata only in Phase 3C). */
  audio: { url: string; durationSec: number; reciter: string | null } | null;
  /**
   * Curator's estimate of the full session (reading the original,
   * transliteration and translation, audio, navigation), in minutes. When
   * absent it is estimated from the text (see duration.ts).
   */
  estimatedMinutes: number | null;
  review: ReviewStatus;
  /** Development fixture: NOT scripture and never production content. */
  devFixture: boolean;
};

/** Terbit's canonical Daily Recitation record: which passage a tradition gets on a date. */
export type DailyRecitationAssignment = {
  /** e.g. "daily-islam-2026-10-12". */
  id: string;
  tradition: FaithTradition;
  date: DayKey;
  provider: string;
  contentId: string;
};

/** Stored with the alarm (JSON). The passage itself is chosen by the daily schedule. */
export type RecitationMissionConfig = { tradition: FaithTradition };

/**
 * How completion is known. Phase 3C is self-reported (no microphone); a later
 * verified-recitation mode would record 'audio_verified'.
 */
export type RecitationVerification = 'self_reported';

export type RecitationMissionResult = {
  type: 'recitation';
  tradition: FaithTradition;
  date: DayKey;
  /** The Daily Recitation assignment, or null when the local fallback passage was used. */
  assignmentId: string | null;
  provider: string;
  contentId: string;
  reference: string;
  sectionCount: number;
  /** From Begin to confirmed completion, in ms. */
  durationMs: number;
  usedFallback: boolean;
  verification: RecitationVerification;
};
