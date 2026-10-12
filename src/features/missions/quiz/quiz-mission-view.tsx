import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { bundledQuestions, type QuestionSource } from './packs';
import { quizHistory } from './quiz';
import { answerQuiz, currentQuizQuestion, nextQuizQuestion, startQuizSession, type QuizSession } from './session';
import { QUIZ_CATEGORY_LABEL, type QuizMissionConfig, type QuizMissionResult } from './types';

const WRONG = '#FF3B30';

type QuizMissionViewProps = {
  config: QuizMissionConfig;
  /** Called once, after the last question. */
  onComplete: (result: QuizMissionResult) => void;
  /** Developer tool: a fixed seed gives a known question set. */
  seed?: number;
  source?: QuestionSource;
};

/**
 * Runs one quiz mission: one question at a time, tap an answer, see whether
 * it was right (with a short explanation), then continue. Questions come
 * from packs on the phone; nothing is fetched. Recently asked questions are
 * avoided where the pack allows.
 */
export function QuizMissionView({ config, onComplete, seed, source = bundledQuestions }: QuizMissionViewProps) {
  const theme = useTheme();
  const [session, setSession] = useState<QuizSession | null>(null);
  const { category, difficulty, questionCount } = config;

  // Starts once per mission (by value, so a parent re-render doesn't restart the quiz).
  useEffect(() => {
    let current = true;
    quizHistory
      .recent()
      .catch(() => [])
      .then((recent) => {
        if (!current) return;
        const now = Date.now();
        setSession(
          startQuizSession({
            config: { category, difficulty, questionCount },
            source,
            seed: seed ?? now,
            now,
            recent: seed === undefined ? recent : [],
          }),
        );
      });
    return () => {
      current = false;
    };
  }, [category, difficulty, questionCount, seed, source]);

  if (!session) {
    return <ThemedText themeColor="textSecondary">Preparing your questions…</ThemedText>;
  }
  const question = currentQuizQuestion(session);
  if (!question) return null;

  const answered = session.chosenIndex !== null;
  const last = session.currentIndex === session.questions.length - 1;
  const chosenCorrect = answered && session.chosenIndex === question.answerIndex;

  function next() {
    if (!session) return;
    const after = nextQuizQuestion(session, Date.now());
    setSession(after);
    if (after.result) {
      quizHistory.record(after.questions.map((x) => x.id)).catch(() => {});
      onComplete(after.result);
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        {QUIZ_CATEGORY_LABEL[session.config.category]} · Question {session.currentIndex + 1} of {session.questions.length}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="headline" style={styles.prompt}>
          {question.prompt}
        </ThemedText>
        {question.choices.map((choice, index) => {
          const isAnswer = index === question.answerIndex;
          const isChosen = index === session.chosenIndex;
          const border = answered && isAnswer ? theme.tint : answered && isChosen ? WRONG : theme.separator;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityState={{ disabled: answered, selected: isChosen }}
              accessibilityLabel={answered && isAnswer ? `${choice}, correct answer` : choice}
              disabled={answered}
              onPress={() => setSession(answerQuiz(session, index))}
              style={({ pressed }) => [
                styles.choice,
                { borderColor: border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
              ]}>
              <ThemedText style={answered && isAnswer ? { color: theme.tint, fontWeight: 600 } : undefined}>
                {choice}
              </ThemedText>
            </Pressable>
          );
        })}
        {answered && (
          <View accessibilityLiveRegion="polite" style={styles.feedback}>
            <ThemedText type="smallBold" style={{ color: chosenCorrect ? theme.tint : WRONG }}>
              {chosenCorrect ? 'Correct!' : `Not quite. The answer is ${question.choices[question.answerIndex]}.`}
            </ThemedText>
            {question.explanation && (
              <ThemedText type="small" themeColor="textSecondary">
                {question.explanation}
              </ThemedText>
            )}
          </View>
        )}
      </ThemedView>
      {answered && <Button title={last ? 'Finish' : 'Next question'} onPress={next} />}
    </View>
  );
}

/** Score, plus a review of each question (question, your answer, the right answer, explanation). */
export function QuizResultSummary({ result, source = bundledQuestions }: { result: QuizMissionResult; source?: QuestionSource }) {
  const theme = useTheme();
  return (
    <View style={styles.summary}>
      <ThemedText themeColor="textSecondary">
        {QUIZ_CATEGORY_LABEL[result.category]} · {result.correctCount} of {result.questionCount} correct ·{' '}
        {Math.round(result.accuracy * 100)}%
      </ThemedText>
      {result.answers.map((a, i) => {
        const question = source.find(a.questionId);
        return (
          <View key={a.questionId} style={styles.review}>
            <ThemedText type="smallBold">
              {i + 1}. {question?.prompt ?? 'Question'}
            </ThemedText>
            <ThemedText type="small" style={{ color: a.isCorrect ? theme.tint : WRONG }}>
              {a.isCorrect ? `✓ ${a.chosen}` : `✗ ${a.chosen} · Answer: ${a.correctAnswer}`}
            </ThemedText>
            {!a.isCorrect && question?.explanation && (
              <ThemedText type="small" themeColor="textSecondary">
                {question.explanation}
              </ThemedText>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  prompt: {
    marginBottom: Spacing.two,
  },
  choice: {
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  feedback: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  summary: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  review: {
    gap: Spacing.half,
  },
});
