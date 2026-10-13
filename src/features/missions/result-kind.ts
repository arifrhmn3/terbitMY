import {
  isCombinedFaithResult,
  isFitnessResult,
  isMathResult,
  isQuizResult,
  isRecitationResult,
  isReflectionResult,
  type MissionResult,
} from './types';

export type ResultKind = 'math' | 'quiz' | 'fitness' | 'recitation' | 'reflection' | 'recitation_reflection';

/** Which mission-specific summary a result gets inside the shared result layout. */
export function resultKind(result: MissionResult): ResultKind {
  if (isQuizResult(result)) return 'quiz';
  if (isFitnessResult(result)) return 'fitness';
  if (isRecitationResult(result)) return 'recitation';
  if (isReflectionResult(result)) return 'reflection';
  if (isCombinedFaithResult(result)) return 'recitation_reflection';
  if (isMathResult(result)) return 'math';
  return 'math';
}
