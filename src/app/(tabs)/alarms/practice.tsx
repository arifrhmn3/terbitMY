import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { FaithDevPanel } from '@/features/faith/components/faith-dev-panel';
import { primaryTradition } from '@/features/faith/faith-settings';
import { CombinedFaithMissionView, CombinedFaithResultSummary } from '@/features/faith/combined-mission-view';
import { RecitationMissionView, RecitationResultSummary } from '@/features/faith/recitation/recitation-view';
import { ReflectionMissionView, ReflectionResultSummary } from '@/features/faith/reflection/reflection-mission-view';
import { REFLECTION_THEME_LABEL, REFLECTION_THEMES, type ReflectionTheme } from '@/features/faith/reflection/types';
import { FAITH_TRADITIONS, isTradition, TRADITION_LABEL, type FaithTradition } from '@/features/faith/types';
import { useFaithDev, useFaithSettings } from '@/features/faith/use-faith';
import { FitnessMissionView, FitnessResultSummary } from '@/features/missions/fitness/fitness-mission-view';
import { EXERCISES } from '@/features/missions/fitness/exercises';
import { FITNESS_EXERCISES, type FitnessExercise } from '@/features/missions/fitness/types';
import { MathMissionView, MathResultSummary } from '@/features/missions/math/math-mission-view';
import { QuizMissionView, QuizResultSummary } from '@/features/missions/quiz/quiz-mission-view';
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABEL, QUIZ_CATEGORY_SHORT, type QuizCategory } from '@/features/missions/quiz/types';
import {
  DIFFICULTY_LABEL,
  isFitnessResult,
  isMathResult,
  isQuizResult,
  isCombinedFaithResult,
  isRecitationResult,
  isReflectionResult,
  MISSION_DIFFICULTIES,
  MISSION_QUESTION_COUNTS,
  type MissionDifficulty,
  type MissionResult,
} from '@/features/missions/types';

type PracticeKind = 'math' | 'quiz' | 'fitness' | 'recitation' | 'reflection' | 'recitation_reflection';
const PRACTICE_KINDS: readonly PracticeKind[] = ['math', 'quiz', 'fitness', 'recitation', 'reflection', 'recitation_reflection'];

/** Developer tool: a short Reflection for quick testing. */
const SHORT_REFLECTION_MS = 15_000;

/**
 * Practise a mission outside an alarm. Nothing rings and no XP is earned.
 * Params: mission=math|quiz|fitness|recitation|reflection|recitation_reflection, category,
 * exercise, tradition, difficulty, count. Development builds also offer
 * switches to launch any mission directly, plus Faith tools (tradition, test
 * date, theme, duration, offline and fallback music).
 */
export default function PracticeMissionScreen() {
  const params = useLocalSearchParams<{
    mission?: string;
    category?: string;
    exercise?: string;
    tradition?: string;
    difficulty?: string;
    count?: string;
  }>();
  const faithSettings = useFaithSettings();
  const dev = useFaithDev();
  const [kind, setKind] = useState<PracticeKind>(PRACTICE_KINDS.find((k) => k === params.mission) ?? 'math');
  const [exercise, setExercise] = useState<FitnessExercise>(
    FITNESS_EXERCISES.find((e) => e === params.exercise) ?? 'squats',
  );
  const [category, setCategory] = useState<QuizCategory>(QUIZ_CATEGORIES.find((c) => c === params.category) ?? 'general');
  const [tradition, setTradition] = useState<FaithTradition>(
    isTradition(params.tradition) ? params.tradition : (primaryTradition(faithSettings) ?? 'islam'),
  );
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(
    MISSION_DIFFICULTIES.find((d) => d === params.difficulty) ?? 'easy',
  );
  const questionCount = MISSION_QUESTION_COUNTS.find((c) => String(c) === params.count) ?? 3;
  /** Developer tools. */
  const [fixedSet, setFixedSet] = useState(false);
  const [theme, setTheme] = useState<ReflectionTheme | null>(null);
  const [shortReflection, setShortReflection] = useState(false);
  const [result, setResult] = useState<MissionResult | null>(null);
  const [round, setRound] = useState(0);
  const restart = () => {
    setResult(null);
    setRound((r) => r + 1);
  };
  // A new test date or offline state starts the mission again with fresh content.
  const missionKey = `${round}-${dev.date ?? 'today'}-${dev.forceOffline}-${dev.forceFallbackMusic}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Practice mission', headerLargeTitleEnabled: false }} />
      <Notice
        title="Practice mode"
        description={`A practice run of the ${practiceName(kind, category, exercise, tradition)}. It isn’t connected to any alarm and earns no XP.`}
      />

      {__DEV__ && !result && (
        <Section title="Practice (developer)" footer="Development builds only. “Fixed set” always shows the same questions.">
          <ChoiceRow
            options={[
              { value: 'math' as const, label: 'Maths' },
              { value: 'quiz' as const, label: 'Quiz' },
              { value: 'fitness' as const, label: 'Fitness' },
              { value: 'recitation' as const, label: 'Recite' },
              { value: 'reflection' as const, label: 'Reflect' },
              { value: 'recitation_reflection' as const, label: 'Both' },
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
          {kind === 'fitness' && (
            <ChoiceRow
              options={FITNESS_EXERCISES.map((e) => ({ value: e, label: EXERCISES[e].short }))}
              value={exercise}
              onChange={(next) => {
                setExercise(next);
                restart();
              }}
            />
          )}
          {(kind === 'recitation' || kind === 'recitation_reflection') && (
            <ChoiceRow
              options={FAITH_TRADITIONS.map((t) => ({ value: t, label: TRADITION_LABEL[t] }))}
              value={tradition}
              onChange={(next) => {
                setTradition(next);
                restart();
              }}
            />
          )}
          {kind === 'reflection' && (
            <ListRow
              icon={{ ios: 'leaf', android: 'spa', web: 'spa' }}
              title={`Theme: ${theme ? REFLECTION_THEME_LABEL[theme] : 'Today’s theme'}`}
              subtitle="Tap to try the next theme"
              onPress={() => {
                const i = theme ? REFLECTION_THEMES.indexOf(theme) : -1;
                setTheme(i + 1 < REFLECTION_THEMES.length ? REFLECTION_THEMES[i + 1] : null);
                restart();
              }}
            />
          )}
          {kind !== 'recitation' && (
            <ChoiceRow
              options={MISSION_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
              value={difficulty}
              onChange={(next) => {
                setDifficulty(next);
                restart();
              }}
            />
          )}
          {(kind === 'reflection' || kind === 'recitation_reflection') && (
            <SwitchRow
              title="Short test session (15 sec)"
              value={shortReflection}
              onValueChange={(next) => {
                setShortReflection(next);
                restart();
              }}
            />
          )}
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
      {__DEV__ && !result && (kind === 'recitation' || kind === 'reflection' || kind === 'recitation_reflection') && (
        <FaithDevPanel tradition={kind === 'reflection' ? null : tradition} />
      )}

      {result ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="title">Mission complete</ThemedText>
            <ResultSummary result={result} />
          </ThemedView>
          <Button title="Done" onPress={() => router.back()} />
          <Button title="Try again" variant="secondary" onPress={restart} />
        </>
      ) : kind === 'recitation' ? (
        <RecitationMissionView key={missionKey} config={{ tradition }} prepareFirst onComplete={setResult} />
      ) : kind === 'recitation_reflection' ? (
        <CombinedFaithMissionView
          key={missionKey}
          config={{ tradition, difficulty }}
          prepareFirst
          reflectionDurationMs={__DEV__ && shortReflection ? SHORT_REFLECTION_MS : undefined}
          onComplete={setResult}
        />
      ) : kind === 'reflection' ? (
        <ReflectionMissionView
          key={missionKey}
          config={{ difficulty }}
          network
          theme={theme ?? undefined}
          durationMs={__DEV__ && shortReflection ? SHORT_REFLECTION_MS : undefined}
          onComplete={setResult}
        />
      ) : kind === 'fitness' ? (
        <FitnessMissionView key={round} config={{ exercise, difficulty }} onComplete={setResult} />
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

function ResultSummary({ result }: { result: MissionResult }) {
  if (isQuizResult(result)) return <QuizResultSummary result={result} />;
  if (isFitnessResult(result)) return <FitnessResultSummary result={result} />;
  if (isRecitationResult(result)) return <RecitationResultSummary result={result} />;
  if (isReflectionResult(result)) return <ReflectionResultSummary result={result} />;
  if (isCombinedFaithResult(result)) return <CombinedFaithResultSummary result={result} />;
  if (isMathResult(result)) return <MathResultSummary result={result} />;
  return null;
}

function practiceName(kind: PracticeKind, category: QuizCategory, exercise: FitnessExercise, tradition: FaithTradition) {
  switch (kind) {
    case 'math':
      return 'maths mission';
    case 'quiz':
      return `${QUIZ_CATEGORY_LABEL[category]} quiz`;
    case 'fitness':
      return `${EXERCISES[exercise].label} mission`;
    case 'recitation':
      return `${TRADITION_LABEL[tradition]} Daily Recitation`;
    case 'reflection':
      return 'Reflection / Meditation';
    case 'recitation_reflection':
      return `${TRADITION_LABEL[tradition]} Recitation + Reflection`;
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
});
