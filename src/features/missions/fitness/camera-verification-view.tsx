import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DisplayTextMaxScale } from '@/constants/text-scale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { systemPermissions } from '@/services/permissions';
import { cameraPermission, getPoseCamera, type CameraPermission, type PoseEvent } from '@/services/pose';

import { EXERCISES } from './exercises';
import { CAMERA_ACTIVITIES, type CameraVerifiableExercise } from './pose/camera-activities';
import { autoStart, CAMERA_COPY, cameraStep, GO_MS } from './pose/camera-flow';
import type { PoseFrame } from './pose/types';
import { initialVerifier, stepVerifier, verifierFeedback, type VerifierState } from './pose/verifier';
import { countdownLeft, fitnessPhase, type FitnessSession } from './session';

type CameraVerificationViewProps = {
  exercise: CameraVerifiableExercise;
  session: FitnessSession;
  now: number;
  /** Starts the mission's countdown by itself once the pose is held still (no tap). */
  onStart: () => void;
  /** Cancels the countdown when the pose is lost before Go. */
  onCancelCountdown: () => void;
  /** One rep counted by the camera, at this time, with the activity's minimum cycle time. */
  onRep: (at: number, minIntervalMs: number) => void;
  /** Back to tap counting; progress so far is kept. */
  onFallback: () => void;
};

const toFrame = (e: PoseEvent): PoseFrame => ({ at: e.at, aspect: e.aspect, joints: e.joints });

/**
 * "Verify with camera" for every camera-verifiable activity: permission (explained
 * first, asked only here), positioning, then an AUTOMATIC start (hold still
 * ~1 s → Ready · 3 → 2 → 1 → Go; no tap, so nobody walks back to the phone),
 * then reps counted on the phone. The camera stops whenever the app leaves
 * the front or this view closes. "Continue without camera" is always offered.
 */
export function CameraVerificationView({ exercise, session, now, onStart, onCancelCountdown, onRep, onFallback }: CameraVerificationViewProps) {
  const theme = useTheme();
  const camera = getPoseCamera();
  const [permission, setPermission] = useState<CameraPermission | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped by "Try again" to recreate the camera. */
  const [attempt, setAttempt] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [counter, setCounter] = useState<VerifierState>(initialVerifier);
  const counterRef = useRef(initialVerifier);
  /** The latest analysed frame's time (feedback timing; frames arrive ~15 times a second). */
  const [frameAt, setFrameAt] = useState(0);
  const activity = CAMERA_ACTIVITIES[exercise];
  const phase = fitnessPhase(session, now);

  useEffect(() => {
    let current = true;
    camera.getAvailability().then((a) => current && setPermission(cameraPermission(a)));
    return () => {
      current = false;
    };
  }, [camera]);

  // Leaving the app pauses the camera; coming back starts positioning again (no counting across the gap).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active') {
        // Drop the rep in progress; reps already counted are kept by the mission.
        counterRef.current = { ...initialVerifier, reps: counterRef.current.reps };
        setCounter(counterRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  async function allow() {
    setPermission(null);
    setPermission(cameraPermission(await camera.requestPermission()));
  }

  function onPose(event: PoseEvent) {
    const { state, event: rep } = stepVerifier(counterRef.current, toFrame(event), activity);
    counterRef.current = state;
    setCounter(state);
    setFrameAt(event.at);
    if (rep === 'counted') onRep(event.at, activity.minCycleMs);
    const decision = autoStart(state, fitnessPhase(session, event.at), event.at);
    if (decision === 'start') onStart();
    if (decision === 'cancel') onCancelCountdown();
  }

  const step = failed ? 'error' : cameraStep(permission);
  const CameraView = camera.CameraView;

  if (step !== 'camera' || !CameraView) {
    const message = {
      checking: null,
      explain: { title: CAMERA_COPY.explainTitle, body: CAMERA_COPY.explain },
      denied: { title: CAMERA_COPY.deniedTitle, body: CAMERA_COPY.denied },
      unavailable: { title: CAMERA_COPY.unavailableTitle, body: CAMERA_COPY.unavailable },
      error: { title: CAMERA_COPY.errorTitle, body: CAMERA_COPY.error },
      camera: { title: CAMERA_COPY.unavailableTitle, body: CAMERA_COPY.unavailable },
    }[step];
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        {message && (
          <>
            <ThemedText type="headline" style={styles.center}>
              {message.title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {message.body}
            </ThemedText>
          </>
        )}
        {step === 'explain' && <Button title="Allow camera" onPress={() => void allow()} />}
        {step === 'denied' && <Button title="Open iPhone Settings" variant="secondary" onPress={() => void systemPermissions.openSettings()} />}
        {step === 'error' && (
          <Button
            title="Try again"
            variant="secondary"
            onPress={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          />
        )}
        {step !== 'checking' && <Button title={CAMERA_COPY.fallback} variant={step === 'explain' ? 'secondary' : 'primary'} onPress={onFallback} />}
      </ThemedView>
    );
  }

  const ready = counter.readiness === 'ready';
  const goAt = session.startedAt === null ? null : session.startedAt + session.countdownMs;
  const left = countdownLeft(session, now);
  const status =
    phase === 'countdown'
      ? left === Math.ceil(session.countdownMs / 1000)
        ? `Ready · ${left}`
        : String(left)
      : phase === 'active'
        ? goAt !== null && frameAt - goAt < GO_MS
          ? 'Go'
          : verifierFeedback(counter, activity, frameAt)
        : counter.readiness === 'not_visible'
          ? (counter.hint ?? activity.phrases.notVisible)
          : 'Hold there';

  return (
    <View style={styles.container}>
      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
        <CameraView
          key={attempt}
          style={StyleSheet.absoluteFill}
          active={appActive && phase !== 'done'}
          onPose={(e) => onPose(e.nativeEvent)}
          onCameraError={(e) => {
            // Going to the background interrupts the camera on purpose; it restarts when Terbit MY is back.
            if (e.nativeEvent.code === 'interrupted' && AppState.currentState !== 'active') return;
            setFailed(true);
          }}
        />
        <View style={[styles.pill, { backgroundColor: ready ? theme.tint : 'rgba(0,0,0,0.6)' }]}>
          <ThemedText type="headline" style={styles.onDark} accessibilityLiveRegion="polite">
            {status}
          </ThemedText>
        </View>
        <View style={styles.countBox}>
          <ThemedText
            style={[styles.big, styles.onDark]}
            maxFontSizeMultiplier={DisplayTextMaxScale}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${session.reps} of ${session.target} ${EXERCISES[exercise].label}`}>
            {session.reps} / {session.target}
          </ThemedText>
        </View>
      </View>

      <ThemedText type="headline" style={styles.center}>
        {EXERCISES[exercise].label}
      </ThemedText>
      {(phase === 'ready' || phase === 'countdown') && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {ready
            ? `${activity.phrases.start}. Hold still and it starts by itself; no need to touch the phone.`
            : `${activity.positioning} It starts by itself once you’re in position.`}
        </ThemedText>
      )}
      {phase === 'active' && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {ready ? 'Each full rep counts. Go at your own pace.' : `${activity.phrases.notVisible} to keep counting. Reps so far are kept.`}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {CAMERA_COPY.privacy}
      </ThemedText>
      <Button title={CAMERA_COPY.fallback} variant="secondary" onPress={onFallback} />
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
    gap: Spacing.three,
    alignItems: 'center',
  },
  preview: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  countBox: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  big: {
    fontSize: 56,
    lineHeight: 68,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  onDark: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
