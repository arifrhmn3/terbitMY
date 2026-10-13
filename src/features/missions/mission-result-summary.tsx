import { CombinedFaithResultSummary } from '@/features/faith/combined-mission-view';
import { RecitationResultSummary } from '@/features/faith/recitation/recitation-view';
import { ReflectionResultSummary } from '@/features/faith/reflection/reflection-mission-view';

import { FitnessResultSummary } from './fitness/fitness-mission-view';
import { MathResultSummary } from './math/math-mission-view';
import { QuizResultSummary } from './quiz/quiz-mission-view';
import { resultKind } from './result-kind';
import {
  isCombinedFaithResult,
  isFitnessResult,
  isMathResult,
  isQuizResult,
  isRecitationResult,
  isReflectionResult,
  type MissionResult,
} from './types';

/**
 * The mission-specific part of a result (the shared layout's "Mission
 * summary"): Maths attempts, quiz score and review, the activity done, the
 * passage read, the Reflection theme and music, or both Faith stages.
 */
export function MissionResultSummary({ result }: { result: MissionResult }) {
  switch (resultKind(result)) {
    case 'quiz':
      return isQuizResult(result) ? <QuizResultSummary result={result} /> : null;
    case 'fitness':
      return isFitnessResult(result) ? <FitnessResultSummary result={result} /> : null;
    case 'recitation':
      return isRecitationResult(result) ? <RecitationResultSummary result={result} /> : null;
    case 'reflection':
      return isReflectionResult(result) ? <ReflectionResultSummary result={result} /> : null;
    case 'recitation_reflection':
      return isCombinedFaithResult(result) ? <CombinedFaithResultSummary result={result} /> : null;
    case 'math':
      return isMathResult(result) ? <MathResultSummary result={result} /> : null;
  }
}
