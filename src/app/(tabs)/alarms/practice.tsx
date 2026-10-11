import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { MathMissionView, MathResultSummary } from '@/features/missions/math/math-mission-view';
import { MATH_DIFFICULTIES, MATH_QUESTION_COUNTS } from '@/features/missions/math/questions';
import type { MathMissionResult } from '@/features/missions/math/session';

/** Practise a maths mission outside an alarm. Nothing rings here and nothing is recorded. */
export default function PracticeMissionScreen() {
  const params = useLocalSearchParams<{ difficulty?: string; count?: string }>();
  const difficulty = MATH_DIFFICULTIES.find((d) => d === params.difficulty) ?? 'easy';
  const questionCount = MATH_QUESTION_COUNTS.find((c) => String(c) === params.count) ?? 3;
  const [result, setResult] = useState<MathMissionResult | null>(null);
  const [round, setRound] = useState(0);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Practice mission', headerLargeTitleEnabled: false }} />
      <Notice
        title="Practice mode"
        description="This is a practice run of the maths mission. It is not connected to any alarm."
      />
      {result ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="title">Mission complete</ThemedText>
            <MathResultSummary result={result} />
          </ThemedView>
          <Button title="Done" onPress={() => router.back()} />
          <Button
            title="Try again"
            variant="secondary"
            onPress={() => {
              setResult(null);
              setRound((r) => r + 1);
            }}
          />
        </>
      ) : (
        <MathMissionView key={round} config={{ difficulty, questionCount }} onComplete={setResult} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
});
