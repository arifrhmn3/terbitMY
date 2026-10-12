import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { formatSeconds } from '@/features/missions/fitness/exercises';
import { DIFFICULTY_LABEL } from '@/features/missions/types';
import { useTheme } from '@/hooks/use-theme';
import { startMeditationAudio, type MeditationPlayer } from '@/services/audio/meditation-player';

import { faith } from '../faith';
import type { ResolvedTrack } from './music/types';
import { findPromptSet, firstPromptSetFor } from './prompts';
import type { ReflectionPick } from './sessions';
import {
  createReflectionSession,
  currentStepIndex,
  pauseReflection,
  reflectionPhase,
  reflectionRemainingMs,
  reflectionResult,
  resumeReflection,
  startReflection,
  tickReflection,
  type ReflectionSession,
} from './session';
import {
  REFLECTION_THEME_LABEL,

  type PromptSet,
  type ReflectionMissionConfig,
  type ReflectionMissionResult,
  type ReflectionTheme,
} from './types';

const TICK_MS = 250;

function clockText(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type Loaded = { daily: ReflectionPick; prompts: PromptSet; music: ResolvedTrack | null };

type ReflectionMissionViewProps = {
  config: ReflectionMissionConfig;
  onComplete: (result: ReflectionMissionResult) => void;
  /**
   * Alarm missions: false (default), so nothing waits on the network; the
   * daily track plays if it's on the phone, else the bundled fallback.
   * Practice may allow the network (with a timeout).
   */
  network?: boolean;
  /** Developer overrides. */
  theme?: ReflectionTheme;
  durationMs?: number;
};

/**
 * A guided Reflection / Meditation session: settle in, prompts through the
 * session, a closing intention. One player plays today's track for the whole
 * session (prompt changes never restart it). It pauses when the app leaves
 * the screen and stops (fading out) when the session ends or is left.
 */
export function ReflectionMissionView({ config, onComplete, network = false, theme, durationMs }: ReflectionMissionViewProps) {
  const colors = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [session, setSession] = useState<ReflectionSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const player = useRef<MeditationPlayer | null>(null);
  const reported = useRef(false);
  const mounted = useRef(true);
  const phase = session ? reflectionPhase(session) : 'ready';
  const paused = session?.pausedAt != null;

  // This session's theme, prompts and track: today's canonical Reflection for
  // the first session of the day, a fresh alternate after that. Music resolution never throws.
  useEffect(() => {
    let current = true;
    (async () => {
      const daily = await faith.nextReflection();
      const prompts = theme ? firstPromptSetFor(theme) : (findPromptSet(daily.promptSetId) ?? firstPromptSetFor(daily.theme));
      const music = await faith.music.resolve(daily.trackId, { network, purpose: 'today' }).catch(() => null);
      if (!current) return;
      setLoaded({ daily, prompts, music });
      setSession(createReflectionSession(prompts, config.difficulty, durationMs));
    })().catch(() => {});
    return () => {
      current = false;
    };
  }, [config.difficulty, theme, durationMs, network]);

  // The music stops whenever the session screen goes away.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void player.current?.stop();
      player.current = null;
    };
  }, []);

  // Time comes from timestamps; this only refreshes the screen.
  const ticking = phase === 'active' && !paused;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setSession((s) => s && tickReflection(s, t));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  // Leaving the app pauses the session and the music.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setSession((s) => s && pauseReflection(s, Date.now()));
        player.current?.pause();
      }
    });
    return () => sub.remove();
  }, []);

  // Done: fade the music out and report the result once.
  useEffect(() => {
    if (!session || !loaded || reported.current) return;
    const result = reflectionResult(session, loaded.daily, loaded.prompts, config.difficulty, loaded.music);
    if (result) {
      reported.current = true;
      void player.current?.stop();
      player.current = null;
      onComplete(result);
    }
  }, [session, loaded, config.difficulty, onComplete]);

  async function start() {
    const t = Date.now();
    setNow(t);
    setSession((s) => s && startReflection(s, t));
    // Starting counts as today's session, so the next one today is a different one.
    if (loaded) {
      void faith.recordReflectionStart(loaded.daily.date, { promptSetId: loaded.prompts.id, trackId: loaded.daily.trackId }).catch(() => {});
    }
    if (loaded?.music && !player.current) {
      const started = await startMeditationAudio(loaded.music.source).catch(() => null);
      // The screen may have closed (or the session ended) while the audio was starting.
      if (!mounted.current || reported.current) void started?.stop();
      else player.current = started;
    }
  }

  function togglePause() {
    const t = Date.now();
    setNow(t);
    if (paused) {
      setSession((s) => s && resumeReflection(s, t));
      player.current?.resume();
    } else {
      setSession((s) => s && pauseReflection(s, t));
      player.current?.pause();
    }
  }

  if (!loaded || !session) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText themeColor="textSecondary">Preparing today’s Reflection…</ThemedText>
      </ThemedView>
    );
  }

  const step = session.steps[currentStepIndex(session, now)];
  const progress = 1 - reflectionRemainingMs(session, now) / session.targetMs;
  const minutes = formatSeconds(Math.round(session.targetMs / 1000));

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        Reflection · {REFLECTION_THEME_LABEL[loaded.prompts.theme]} · {DIFFICULTY_LABEL[config.difficulty]} · {minutes}
      </ThemedText>

      {phase === 'ready' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title">{REFLECTION_THEME_LABEL[loaded.prompts.theme]}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {minutes} guided session{loaded.daily.alternate ? ' · another session for today' : ''}
          </ThemedText>
          {loaded.music && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Music: {loaded.music.track.title}
              {loaded.music.track.approval === 'dev_placeholder' ? ' (development placeholder)' : ''}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Music plays even in silent mode and pauses other audio. Find a comfortable position.
          </ThemedText>
          <Button title="Start" onPress={start} />
        </ThemedView>
      )}

      {phase === 'active' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="caption" themeColor="textSecondary">
            {step.kind === 'settle' ? 'Settle in' : step.kind === 'closing' ? 'Closing intention' : 'Reflect'}
          </ThemedText>
          <ThemedText type="headline" style={styles.prompt} accessibilityLiveRegion="polite">
            {step.text}
          </ThemedText>
          <View style={[styles.bar, { backgroundColor: colors.separator }]}>
            <View style={[styles.fill, { backgroundColor: colors.tint, width: `${Math.round(Math.min(1, progress) * 100)}%` }]} />
          </View>
          <ThemedText themeColor="textSecondary">{paused ? 'Paused' : clockText(reflectionRemainingMs(session, now))}</ThemedText>
          <Button title={paused ? 'Resume' : 'Pause'} variant={paused ? 'primary' : 'secondary'} onPress={togglePause} />
        </ThemedView>
      )}
    </View>
  );
}

export function ReflectionResultSummary({ result }: { result: ReflectionMissionResult }) {
  return (
    <>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        Session complete · {REFLECTION_THEME_LABEL[result.theme]} · {formatSeconds(Math.max(1, Math.round(result.durationMs / 1000)))}
      </ThemedText>
      {result.trackTitle !== '' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Music: {result.trackTitle}
        </ThemedText>
      )}
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
  prompt: {
    textAlign: 'center',
    minHeight: 96,
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
