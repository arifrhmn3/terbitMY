import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DIFFICULTY_LABEL } from '../types';
import { EXERCISES, formatSeconds, formatTarget } from './exercises';
import {
  countdownLeft,
  createFitnessSession,
  fitnessPhase,
  fitnessResult,
  pauseFitness,
  recordRep,
  remainingMs,
  resumeFitness,
  startFitness,
  tickFitness,
  type FitnessSession,
} from './session';
import type { FitnessMissionConfig, FitnessMissionResult } from './types';

const TICK_MS = 200;

function clockText(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type FitnessMissionViewProps = {
  config: FitnessMissionConfig;
  /** Called once, when the target is reached. */
  onComplete: (result: FitnessMissionResult) => void;
};

/**
 * Runs one fitness mission: Start → 3-second countdown → reps (one deliberate
 * tap per rep; taps faster than a real rep are ignored) or a timer (which
 * keeps real time even if the app goes to the background). Self-reported:
 * the phone doesn't check the movement in this version.
 */
export function FitnessMissionView({ config, onComplete }: FitnessMissionViewProps) {
  const theme = useTheme();
  const [session, setSession] = useState<FitnessSession>(() => createFitnessSession(config));
  const [now, setNow] = useState(() => Date.now());
  const [tooFast, setTooFast] = useState(false);
  const reported = useRef(false);
  const exercise = EXERCISES[config.exercise];
  const phase = fitnessPhase(session, now);

  // Re-render a few times a second while counting down or timing; time itself comes from timestamps.
  const ticking = phase === 'countdown' || (phase === 'active' && session.kind === 'timed');
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setSession((s) => tickFitness(s, t));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  // Report completion exactly once.
  useEffect(() => {
    const result = fitnessResult(session);
    if (result && !reported.current) {
      reported.current = true;
      onComplete(result);
    }
  }, [session, onComplete]);

  function start() {
    const t = Date.now();
    setNow(t);
    setSession((s) => startFitness(s, t));
  }

  function rep() {
    const t = Date.now();
    setNow(t);
    const { session: next, outcome } = recordRep(session, t);
    setSession(next);
    setTooFast(outcome === 'too_fast');
  }

  const progress =
    session.kind === 'reps' ? session.reps / session.target : 1 - remainingMs(session, now) / (session.target * 1000);

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        Fitness · {exercise.label} · {DIFFICULTY_LABEL[config.difficulty]} · {formatTarget(config.exercise, config.difficulty)}
      </ThemedText>

      {phase === 'ready' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title">{exercise.label}</ThemedText>
          <ThemedText type="headline">
            {session.kind === 'reps' ? `${session.target} reps` : formatSeconds(session.target)}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {exercise.howTo}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {session.kind === 'reps'
              ? 'Self-reported: tap the big button once after each full rep.'
              : 'Self-reported: keep going until the timer ends.'}{' '}
            Go at your own pace and stop if anything hurts.
          </ThemedText>
          <Button title="Start" onPress={start} />
        </ThemedView>
      )}

      {phase === 'countdown' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="headline">Get ready</ThemedText>
          <ThemedText style={[styles.big, { color: theme.tint }]} accessibilityLiveRegion="polite">
            {countdownLeft(session, now)}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'reps' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.big} accessibilityLiveRegion="polite" accessibilityLabel={`${session.reps} of ${session.target} reps`}>
            {session.reps} / {session.target}
          </ThemedText>
          <Bar progress={progress} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Count one rep"
            accessibilityHint="Tap once after each full repetition"
            onPress={rep}
            style={({ pressed }) => [styles.repButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText type="headline" style={styles.repText}>
              + 1 rep
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {tooFast ? 'Too fast. Finish the full movement, then tap.' : 'Tap after each full rep.'}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'timed' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.big} accessibilityLiveRegion="polite">
            {clockText(remainingMs(session, now))}
          </ThemedText>
          <Bar progress={progress} />
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {session.pausedAt !== null ? 'Paused' : exercise.howTo}
          </ThemedText>
          {session.pausedAt === null ? (
            <Button title="Pause" variant="secondary" onPress={() => setSession((s) => pauseFitness(s, Date.now()))} />
          ) : (
            <Button title="Resume" onPress={() => setSession((s) => resumeFitness(s, Date.now()))} />
          )}
        </ThemedView>
      )}
    </View>
  );
}

function Bar({ progress }: { progress: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.separator }]}>
      <View style={[styles.fill, { backgroundColor: theme.tint, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
    </View>
  );
}

/** What was done, at what difficulty, and that it was self-reported. */
export function FitnessResultSummary({ result }: { result: FitnessMissionResult }) {
  const amount = result.kind === 'reps' ? `${result.achieved} reps` : formatSeconds(result.achieved);
  return (
    <>
      <ThemedText themeColor="textSecondary">
        {EXERCISES[result.exercise].label} · {amount} · {DIFFICULTY_LABEL[result.difficulty]}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Self-reported · {formatSeconds(Math.max(1, Math.round(result.durationMs / 1000)))} from start to done
      </ThemedText>
    </>
  );
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
  center: {
    textAlign: 'center',
  },
  big: {
    fontSize: 64,
    lineHeight: 76,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  repButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repText: {
    color: '#FFFFFF',
  },
  bar: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
  },
});
