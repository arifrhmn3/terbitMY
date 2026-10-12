import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { MathMissionView, MathResultSummary } from '@/features/missions/math/math-mission-view';
import { QuizMissionView, QuizResultSummary } from '@/features/missions/quiz/quiz-mission-view';
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABEL, QUIZ_CATEGORY_SHORT, type QuizCategory } from '@/features/missions/quiz/types';
import {
  DIFFICULTY_LABEL,
  isQuizResult,
  MISSION_DIFFICULTIES,
  MISSION_QUESTION_COUNTS,
  type MissionDifficulty,
  type MissionResult,
} from '@/features/missions/types';

/**
 * Practise a mission outside an alarm. Nothing rings and no XP is earned.
 * Params: mission=math|quiz, category, difficulty, count. Development builds
 * also offer switches for topic/difficulty and a fixed question set.
 */
export default function PracticeMissionScreen() {
  const params = useLocalSearchParams<{ mission?: string; category?: string; difficulty?: string; count?: string }>();
  const [kind, setKind] = useState<'math' | 'quiz'>(params.mission === 'quiz' ? 'quiz' : 'math');
  const [category, setCategory] = useState<QuizCategory>(QUIZ_CATEGORIES.find((c) => c === params.category) ?? 'general');
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(
    MISSION_DIFFICULTIES.find((d) => d === params.difficulty) ?? 'easy',
  );
  const questionCount = MISSION_QUESTION_COUNTS.find((c) => String(c) === params.count) ?? 3;
  /** Developer tool: a fixed seed always gives the same questions. */
  const [fixedSet, setFixedSet] = useState(false);
  const [result, setResult] = useState<MissionResult | null>(null);
  const [round, setRound] = useState(0);
  const restart = () => {
    setResult(null);
    setRound((r) => r + 1);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Practice mission', headerLargeTitleEnabled: false }} />
      <Notice
        title="Practice mode"
        description={`A practice run of the ${kind === 'quiz' ? `${QUIZ_CATEGORY_LABEL[category]} quiz` : 'maths mission'}. It isn’t connected to any alarm and earns no XP.`}
      />

      {__DEV__ && !result && (
        <Section title="Practice (developer)" footer="Development builds only. “Fixed set” always shows the same questions.">
          <ChoiceRow
            options={[
              { value: 'math' as const, label: 'Maths' },
              { value: 'quiz' as const, label: 'Quiz' },
            ]}
            value={kind}
            onChange={(next) => {
              setKind(next);
              restart();
            }}
          />
          {kind === 'quiz' && (
            <ChoiceRow
              options={QUIZ_CATEGORIES.map((c) => ({ value: c, label: QUIZ_CATEGORY_SHORT[c] }))}
              value={category}
              onChange={(next) => {
                setCategory(next);
                restart();
              }}
            />
          )}
          <ChoiceRow
            options={MISSION_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
            value={difficulty}
            onChange={(next) => {
              setDifficulty(next);
              restart();
            }}
          />
          {kind === 'quiz' && (
            <ChoiceRow
              options={[
                { value: false, label: 'Random' },
                { value: true, label: 'Fixed set' },
              ]}
              value={fixedSet}
              onChange={(next) => {
                setFixedSet(next);
                restart();
              }}
            />
          )}
        </Section>
      )}

      {result ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="title">Mission complete</ThemedText>
            {isQuizResult(result) ? <QuizResultSummary result={result} /> : <MathResultSummary result={result} />}
          </ThemedView>
          <Button title="Done" onPress={() => router.back()} />
          <Button title="Try again" variant="secondary" onPress={restart} />
        </>
      ) : kind === 'quiz' ? (
        <QuizMissionView
          key={round}
          config={{ category, difficulty, questionCount }}
          seed={fixedSet ? 42 : undefined}
          onComplete={setResult}
        />
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
