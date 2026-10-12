import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';

/** A bundled asset (`require()`d module) or a file/stream URI. */
export type MeditationSource = number | { uri: string };

export type MeditationPlayer = {
  pause(): void;
  resume(): void;
  /** Fades out, releases the player and hands audio back to other apps. */
  stop(): Promise<void>;
};

const FADE_MS = 2000;
const FADE_STEPS = 20;
const VOLUME = 0.8;

function fade(player: AudioPlayer, from: number, to: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      try {
        player.volume = from + ((to - from) * step) / FADE_STEPS;
      } catch {
        // player already released
      }
      if (step >= FADE_STEPS) {
        clearInterval(timer);
        resolve();
      }
    }, ms / FADE_STEPS);
  });
}

/**
 * Background music for a Reflection / Meditation session. The user started
 * an audio-guided session, so on iOS it plays even when the silent switch is
 * on, and takes audio focus: other apps' audio (Spotify, Apple Music…) is
 * paused, not mixed. It loops continuously; prompt changes never touch it.
 * No background playback: the session pauses with the app.
 */
export async function startMeditationAudio(source: MeditationSource): Promise<MeditationPlayer> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    allowsRecording: false,
  });
  await setIsAudioActiveAsync(true);
  const player = createAudioPlayer(source);
  player.loop = true;
  player.volume = 0;
  player.play();
  void fade(player, 0, VOLUME, FADE_MS);
  let stopped = false;

  return {
    pause() {
      if (!stopped) player.pause();
    },
    resume() {
      if (!stopped) player.play();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await fade(player, player.volume, 0, FADE_MS / 2);
      player.pause();
      player.remove();
      // Let other apps' audio carry on.
      await setIsAudioActiveAsync(false).catch(() => {});
    },
  };
}
