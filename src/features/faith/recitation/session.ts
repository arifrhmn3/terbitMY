import type { DayKey } from '@/features/progress/day';

import type { FaithTradition } from '../types';
import type { OpenedRecitation } from './library';
import type { RecitationMissionResult, RecitationSection } from './types';

/**
 * One Recitation mission, as pure state. Self-reported: Terbit can't tell
 * whether the passage was actually recited, and doesn't pretend to.
 *
 *   ready ─Begin─► reading (page by page) ─last page─► confirm ─I've finished─► done
 *
 * Moving back is always allowed. A later verified mode (e.g. on-device
 * speech) would add a check before `confirm` without changing this flow.
 */
export type RecitationPhase = 'ready' | 'reading' | 'confirm' | 'done';

export type RecitationSession = {
  pageCount: number;
  sectionsPerPage: number;
  /** The page on screen (0-based). */
  page: number;
  /** The reader is on the confirmation step after the last page. */
  confirming: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export const SECTIONS_PER_PAGE = 3;

export function createRecitationSession(sectionCount: number, sectionsPerPage = SECTIONS_PER_PAGE): RecitationSession {
  return {
    pageCount: Math.max(1, Math.ceil(sectionCount / sectionsPerPage)),
    sectionsPerPage,
    page: 0,
    confirming: false,
    startedAt: null,
    completedAt: null,
  };
}

export function recitationPhase(s: RecitationSession): RecitationPhase {
  if (s.completedAt !== null) return 'done';
  if (s.startedAt === null) return 'ready';
  return s.confirming ? 'confirm' : 'reading';
}

export function beginRecitation(s: RecitationSession, now: number): RecitationSession {
  return s.startedAt === null ? { ...s, startedAt: now } : s;
}

/** Next page, or the confirmation step after the last page. */
export function nextPage(s: RecitationSession): RecitationSession {
  if (recitationPhase(s) !== 'reading') return s;
  if (s.page >= s.pageCount - 1) return { ...s, confirming: true };
  return { ...s, page: s.page + 1 };
}

export function previousPage(s: RecitationSession): RecitationSession {
  if (recitationPhase(s) === 'confirm') return { ...s, confirming: false };
  if (recitationPhase(s) !== 'reading' || s.page === 0) return s;
  return { ...s, page: s.page - 1 };
}

/**
 * Where the reader is in the passage (0–1): the CURRENT page, so Back moves
 * the bar back (page 2 of 4 is 50%). The confirmation step and a finished
 * Recitation are 100%. Completion doesn't depend on this: confirming is only
 * reachable with Next from the last page.
 */
export function recitationProgress(s: RecitationSession): number {
  if (s.confirming || s.completedAt !== null) return 1;
  return s.startedAt === null ? 0 : (s.page + 1) / s.pageCount;
}

/** The user confirms they finished. Only possible after reaching the end of the passage. */
export function confirmRecitation(s: RecitationSession, now: number): RecitationSession {
  return recitationPhase(s) === 'confirm' ? { ...s, completedAt: now } : s;
}

export function pageSections(s: RecitationSession, sections: readonly RecitationSection[]): readonly RecitationSection[] {
  return sections.slice(s.page * s.sectionsPerPage, (s.page + 1) * s.sectionsPerPage);
}

export function recitationResult(
  s: RecitationSession,
  opened: OpenedRecitation,
  tradition: FaithTradition,
  date: DayKey,
): RecitationMissionResult | null {
  if (s.completedAt === null || s.startedAt === null) return null;
  return {
    type: 'recitation',
    tradition,
    date,
    assignmentId: opened.usedFallback ? null : (opened.assignment?.id ?? null),
    provider: opened.passage.provider,
    contentId: opened.passage.contentId,
    reference: opened.passage.reference,
    sectionCount: opened.passage.sections.length,
    durationMs: Math.max(0, s.completedAt - s.startedAt),
    usedFallback: opened.usedFallback,
    verification: 'self_reported',
  };
}
