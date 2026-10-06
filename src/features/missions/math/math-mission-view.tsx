import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  currentQuestion,
  startMathSession,
  submitMathAnswer,
  type MathMissionConfig,
  type MathMissionResult,
} from './session';

type MathMissionViewProps = {
  config: MathMissionConfig;
  /** Called once, when the last question is answered correctly. */
  onComplete: (result: MathMissionResult) => void;
};

const feedbackText = {
  correct: 'Correct!',
  incorrect: 'Not quite. Try again.',
  invalid: 'Type a whole number.',
} as const;

/**
 * Runs one maths mission: questions, with a retry after each wrong answer.
 * The parent decides what to show once `onComplete` fires.
 */
export function MathMissionView({ config, onComplete }: MathMissionViewProps) {
  const theme = useTheme();
  const [session, setSession] = useState(() => startMathSession(config, Date.now(), Date.now()));
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  const question = currentQuestion(session);

  function submit() {
    if (!question) return;
    const next = submitMathAnswer(session, input, Date.now());
    setSession(next);
    if (next.lastCheck !== 'invalid') setInput('');
    if (next.result) {
      onComplete(next.result);
    } else {
      inputRef.current?.focus();
    }
  }

  if (!question) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        Question {session.currentIndex + 1} of {session.questions.length}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.prompt} accessibilityLabel={`What is ${question.prompt}?`}>
          {question.prompt} = ?
        </ThemedText>
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submit}
          keyboardType="number-pad"
          returnKeyType="done"
          submitBehavior="submit"
          autoFocus
          maxLength={6}
          accessibilityLabel="Your answer"
          placeholder="Answer"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
        />
        <ThemedText
          type="small"
          accessibilityLiveRegion="polite"
          style={{ color: session.lastCheck === 'correct' ? theme.tint : theme.textSecondary }}>
          {session.lastCheck ? feedbackText[session.lastCheck] : ' '}
        </ThemedText>
      </ThemedView>
      <Button title="Check answer" onPress={submit} disabled={input.trim() === ''} />
    </View>
  );
}

/** Accuracy, mistakes and time for a finished mission. */
export function MathResultSummary({ result }: { result: MathMissionResult }) {
  const mistakes =
    result.wrongAttempts === 0
      ? 'No wrong answers'
      : `${result.wrongAttempts} wrong ${result.wrongAttempts === 1 ? 'answer' : 'answers'}`;

  return (
    <>
      <ThemedText themeColor="textSecondary">
        {result.questionCount} questions · {Math.round(result.accuracy * 100)}% accuracy
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {mistakes} · {formatDuration(result.durationMs)}
      </ThemedText>
    </>
  );
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  prompt: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  input: {
    alignSelf: 'stretch',
    fontSize: 28,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: Spacing.two,
  },
});
