import { FAITH_POLICY } from '../policy';
import type { RecitationDisplay } from '../types';
import type { RecitationPassage } from './types';

const words = (text: string | null) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * Estimated minutes for the whole session: the original text, the
 * transliteration and translation when shown, optional audio, and moving
 * between sections. A curator's own estimate wins when present.
 */
export function estimateMinutes(
  passage: RecitationPassage,
  display: RecitationDisplay = { showTransliteration: true, showTranslation: true },
): number {
  if (passage.estimatedMinutes !== null) return passage.estimatedMinutes;
  const p = FAITH_POLICY.recitation;
  let seconds = passage.sections.length * p.secondsPerSection;
  for (const s of passage.sections) {
    seconds += (words(s.original) / p.wordsPerMinute.original) * 60;
    if (display.showTransliteration) seconds += (words(s.transliteration) / p.wordsPerMinute.transliteration) * 60;
    if (display.showTranslation) seconds += (words(s.translation) / p.wordsPerMinute.translation) * 60;
  }
  if (passage.audio) seconds += passage.audio.durationSec;
  return Math.round((seconds / 60) * 10) / 10;
}

/**
 * Whether a passage may be a Daily Recitation: within the acceptable range
 * and never above the hard ceiling. Passages are never shortened to fit;
 * a different passage is chosen instead.
 */
export function isEligibleForDaily(passage: RecitationPassage): boolean {
  const minutes = estimateMinutes(passage);
  const { acceptableMinutes, maxMinutes } = FAITH_POLICY.recitation;
  return minutes >= acceptableMinutes.min && minutes <= Math.min(acceptableMinutes.max, maxMinutes);
}

/** For curation tools: eligible passages, closest to the target length first. */
export function rankForDaily(passages: readonly RecitationPassage[]): RecitationPassage[] {
  const { min, max } = FAITH_POLICY.recitation.targetMinutes;
  const distance = (m: number) => (m < min ? min - m : m > max ? m - max : 0);
  return passages.filter(isEligibleForDaily).sort((a, b) => distance(estimateMinutes(a)) - distance(estimateMinutes(b)));
}
