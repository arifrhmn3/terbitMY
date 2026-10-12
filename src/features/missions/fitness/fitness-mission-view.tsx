import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DisplayTextMaxScale } from '@/constants/text-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DIFFICULTY_LABEL } from '../types';
import { EXERCISES, formatAmount, formatSeconds, formatTarget } from './exercises';
import {
  countdownLeft,
  createFitnessSession,
  currentCue,
  fitnessPhase,
  fitnessResult,
  pauseFitness,
  recordHold,
  recordRep,
  remainingMs,
  resumeFitness,
  startFitness,
  tapNumber,
  tickFitness,
  type FitnessSession,
  type RepOutcome,
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

const READY_NOTE = {
  reps: 'Self-reported: tap the big button once after each full rep.',
  timed: 'Self-reported: keep going until the timer ends.',
  holds: 'Press and hold the button until it says release, then let go.',
  sequence: 'Each tap is checked. A wrong number just doesn’t count; take your time.',
} as const;

const FEEDBACK: Partial<Record<RepOutcome, string>> = {
  too_fast: 'Too fast. Finish the full movement, then tap.',
  too_short: 'Hold a little longer before you let go.',
  wrong: 'Not that one. Look for the next number.',
};

/**
 * Runs one Fitness mission from any Mobility Profile's catalogue: Start →
 * “get ready” countdown (longer with Extended pacing) → reps, a timer (with
 * guided cues for breathing and grounding), holds, or number focus. Time
 * comes from timestamps, so it stays right in the background. Movement is
 * self-reported; non-physical activities are never presented as exercise.
 */
export function FitnessMissionView({ config, onComplete }: FitnessMissionViewProps) {
  const theme = useTheme();
  const [session, setSession] = useState<FitnessSession>(() => createFitnessSession(config));
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<RepOutcome | null>(null);
  const [holdingSince, setHoldingSince] = useState<number | null>(null);
  const reported = useRef(false);
  const activity = EXERCISES[config.exercise];
  const physical = activity.profile !== 'non_physical';
  const phase = fitnessPhase(session, now);

  // Re-render a few times a second while counting down, timing or holding; time itself comes from timestamps.
  const ticking = phase === 'countdown' || (phase === 'active' && (session.kind === 'timed' || holdingSince !== null));
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

  function apply(next: { session: FitnessSession; outcome: RepOutcome }) {
    setSession(next.session);
    setFeedback(next.outcome === 'counted' || next.outcome === 'not_active' ? null : next.outcome);
  }

  function start() {
    const t = Date.now();
    setNow(t);
    setSession((s) => startFitness(s, t));
  }

  const stamp = () => {
    const t = Date.now();
    setNow(t);
    return t;
  };

  const progress =
    session.kind === 'timed' ? 1 - remainingMs(session, now) / (session.target * 1000) : session.reps / session.target;

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        {physical ? 'Fitness' : 'Wake-up activity'} · {activity.label} · {DIFFICULTY_LABEL[config.difficulty]} ·{' '}
        {formatTarget(config.exercise, config.difficulty)}
      </ThemedText>

      {phase === 'ready' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.center}>
            {activity.label}
          </ThemedText>
          <ThemedText type="headline">{formatTarget(config.exercise, config.difficulty)}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {activity.howTo}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {READY_NOTE[session.kind]}
            {physical ? ' Go at your own pace and stop if anything hurts.' : ''}
          </ThemedText>
          <Button title="Start" onPress={start} />
        </ThemedView>
      )}

      {phase === 'countdown' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="headline">Get ready</ThemedText>
          <ThemedText style={[styles.big, { color: theme.tint }]} maxFontSizeMultiplier={DisplayTextMaxScale} accessibilityLiveRegion="polite">
            {countdownLeft(session, now)}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'reps' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <Counter session={session} unit="reps" />
          <Bar progress={progress} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Count one rep"
            accessibilityHint="Tap once after each full repetition"
            onPress={() => apply(recordRep(session, stamp()))}
            style={({ pressed }) => [styles.bigButton, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText type="headline" style={styles.onTint}>
              + 1 rep
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {(feedback && FEEDBACK[feedback]) ?? 'Tap after each full rep.'}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'holds' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <Counter session={session} unit="holds" />
          <Bar progress={progress} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold, then release"
            accessibilityHint={`Press and hold for ${Math.round(session.minHoldMs / 1000)} seconds, then let go`}
            onPressIn={() => {
              setFeedback(null);
              setHoldingSince(stamp());
            }}
            onPressOut={() => {
              const released = stamp();
              if (holdingSince !== null) apply(recordHold(session, holdingSince, released));
              setHoldingSince(null);
            }}
            style={[styles.bigButton, { backgroundColor: theme.tint, opacity: holdingSince !== null ? 0.8 : 1 }]}>
            <ThemedText type="headline" style={styles.onTint}>
              {holdingSince === null ? 'Press and hold' : now - holdingSince >= session.minHoldMs ? 'Release' : 'Hold…'}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center} accessibilityLiveRegion="polite">
            {(feedback && FEEDBACK[feedback]) ?? `Hold for ${Math.round(session.minHoldMs / 1000)} seconds, then let go.`}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'sequence' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="headline" accessibilityLiveRegion="polite">
            Round {Math.min(session.reps + 1, session.target)} of {session.target} · Next: {session.nextNumber}
          </ThemedText>
          <Bar progress={progress} />
          <View style={styles.grid}>
            {session.grid.map((n) => {
              const done = n < session.nextNumber;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityLabel={`${n}`}
                  accessibilityState={{ disabled: done }}
                  disabled={done}
                  onPress={() => apply(tapNumber(session, n, stamp()))}
                  style={({ pressed }) => [
                    styles.cell,
                    { backgroundColor: done ? theme.backgroundSelected : theme.tint, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText type="title" style={done ? { color: theme.textSecondary } : styles.onTint} maxFontSizeMultiplier={DisplayTextMaxScale}>
                    {n}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {(feedback && FEEDBACK[feedback]) ?? 'Tap the numbers in order, from 1 to 9.'}
          </ThemedText>
        </ThemedView>
      )}

      {phase === 'active' && session.kind === 'timed' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.big} maxFontSizeMultiplier={DisplayTextMaxScale} accessibilityLiveRegion="polite">
            {clockText(remainingMs(session, now))}
          </ThemedText>
          <Bar progress={progress} />
          <ThemedText type={currentCue(session, now) ? 'headline' : 'default'} style={styles.center} accessibilityLiveRegion="polite">
            {session.pausedAt !== null ? 'Paused' : (currentCue(session, now) ?? activity.howTo)}
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

function Counter({ session, unit }: { session: FitnessSession; unit: string }) {
  return (
    <ThemedText
      style={styles.big}
      maxFontSizeMultiplier={DisplayTextMaxScale}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${session.reps} of ${session.target} ${unit}`}>
      {session.reps} / {session.target}
    </ThemedText>
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

/** What was done, at what difficulty, and how it is known. */
export function FitnessResultSummary({ result }: { result: FitnessMissionResult }) {
  return (
    <>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        {EXERCISES[result.exercise].label} · {formatAmount(result.exercise, result.achieved)} · {DIFFICULTY_LABEL[result.difficulty]}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {result.verification === 'task_checked' ? 'Checked' : 'Self-reported'} ·{' '}
        {formatSeconds(Math.max(1, Math.round(result.durationMs / 1000)))} from start to done
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
  // Grows with large text instead of clipping its label.
  bigButton: {
    minWidth: 200,
    minHeight: 200,
    padding: Spacing.three,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onTint: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  grid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  cell: {
    width: '30%',
    minHeight: 64,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
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
