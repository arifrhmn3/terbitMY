import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import {
  faithSequenceResult,
  finishRecitationStage,
  finishReflectionStage,
  startFaithSequence,
  type CombinedFaithMissionConfig,
  type CombinedFaithMissionResult,
  type FaithSequence,
} from './combined';
import { RecitationMissionView, RecitationResultSummary } from './recitation/recitation-view';
import type { RecitationMissionResult } from './recitation/types';
import { ReflectionMissionView, ReflectionResultSummary } from './reflection/reflection-mission-view';
import type { ReflectionMissionResult } from './reflection/types';

type CombinedFaithMissionViewProps = {
  config: CombinedFaithMissionConfig;
  onComplete: (result: CombinedFaithMissionResult) => void;
  /** Practice: get today's passage first and let Reflection fetch its music. Alarms: false (offline first). */
  prepareFirst?: boolean;
  /** Developer override for a short Reflection. */
  reflectionDurationMs?: number;
};

/**
 * Recitation + Reflection on one alarm: today's Recitation, then a Reflection.
 * The mission completes (once) only when both are done; leaving part-way
 * completes nothing.
 */
export function CombinedFaithMissionView({ config, onComplete, prepareFirst = false, reflectionDurationMs }: CombinedFaithMissionViewProps) {
  const [sequence, setSequence] = useState<FaithSequence>(startFaithSequence);
  const reported = useRef(false);

  const onRecitation = useCallback((r: RecitationMissionResult) => setSequence((s) => finishRecitationStage(s, r)), []);
  const onReflection = useCallback(
    (r: ReflectionMissionResult) => setSequence((s) => finishReflectionStage(s, config, r)),
    [config],
  );

  useEffect(() => {
    const result = faithSequenceResult(sequence);
    if (result && !reported.current) {
      reported.current = true;
      onComplete(result);
    }
  }, [sequence, onComplete]);

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
        Step {sequence.stage === 'recitation' ? 1 : 2} of 2 · {sequence.stage === 'recitation' ? 'Recitation' : 'Reflection'}
      </ThemedText>
      {sequence.stage === 'recitation' && (
        <RecitationMissionView config={{ tradition: config.tradition }} prepareFirst={prepareFirst} onComplete={onRecitation} />
      )}
      {sequence.stage === 'reflection' && (
        <ReflectionMissionView
          config={{ difficulty: config.difficulty }}
          network={prepareFirst}
          durationMs={reflectionDurationMs}
          onComplete={onReflection}
        />
      )}
    </View>
  );
}

export function CombinedFaithResultSummary({ result }: { result: CombinedFaithMissionResult }) {
  return (
    <>
      <RecitationResultSummary result={result.recitation} />
      <ReflectionResultSummary result={result.reflection} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
});
