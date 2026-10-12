import type { MissionDifficulty } from '@/features/missions/types';

import type { RecitationMissionResult } from './recitation/types';
import type { ReflectionMissionResult } from './reflection/types';
import type { FaithTradition } from './types';

/** Stored with the alarm (JSON): today's Recitation, then a Reflection of this length. */
export type CombinedFaithMissionConfig = { tradition: FaithTradition; difficulty: MissionDifficulty };

/**
 * One alarm occurrence, one mission result: both stages are kept, but the
 * occurrence earns the Faith mission reward once (progression reads the
 * alarm's mission type, not the stages).
 */
export type CombinedFaithMissionResult = {
  type: 'recitation_reflection';
  tradition: FaithTradition;
  difficulty: MissionDifficulty;
  recitation: RecitationMissionResult;
  reflection: ReflectionMissionResult;
  /** Both stages together, in ms. */
  durationMs: number;
};

/** Recitation → Reflection. Only `done` completes the mission; leaving earlier completes nothing. */
export type FaithSequence =
  | { stage: 'recitation' }
  | { stage: 'reflection'; recitation: RecitationMissionResult }
  | { stage: 'done'; result: CombinedFaithMissionResult };

export function startFaithSequence(): FaithSequence {
  return { stage: 'recitation' };
}

/** Recitation finished: Reflection begins. Ignored at any other stage. */
export function finishRecitationStage(sequence: FaithSequence, recitation: RecitationMissionResult): FaithSequence {
  return sequence.stage === 'recitation' ? { stage: 'reflection', recitation } : sequence;
}

/** Reflection finished: the mission is complete. Ignored unless Recitation is already done (it can't be skipped). */
export function finishReflectionStage(
  sequence: FaithSequence,
  config: CombinedFaithMissionConfig,
  reflection: ReflectionMissionResult,
): FaithSequence {
  if (sequence.stage !== 'reflection') return sequence;
  return {
    stage: 'done',
    result: {
      type: 'recitation_reflection',
      tradition: config.tradition,
      difficulty: config.difficulty,
      recitation: sequence.recitation,
      reflection,
      durationMs: sequence.recitation.durationMs + reflection.durationMs,
    },
  };
}

export function faithSequenceResult(sequence: FaithSequence): CombinedFaithMissionResult | null {
  return sequence.stage === 'done' ? sequence.result : null;
}
