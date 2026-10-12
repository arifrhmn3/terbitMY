import type { DayKey } from '@/features/progress/day';
import type { MissionDifficulty } from '@/features/missions/types';

import type { TrackId, TrackSourceKind } from './music/types';

export type ReflectionTheme =
  | 'gratitude'
  | 'intention'
  | 'patience'
  | 'calm'
  | 'mindfulness'
  | 'spiritual_reflection'
  | 'perspective'
  | 'compassion';

export const REFLECTION_THEMES: readonly ReflectionTheme[] = [
  'gratitude',
  'intention',
  'patience',
  'calm',
  'mindfulness',
  'spiritual_reflection',
  'perspective',
  'compassion',
];

export const REFLECTION_THEME_LABEL: Record<ReflectionTheme, string> = {
  gratitude: 'Gratitude',
  intention: 'Intention',
  patience: 'Patience',
  calm: 'Calm',
  mindfulness: 'Mindfulness',
  spiritual_reflection: 'Spiritual reflection',
  perspective: 'Perspective',
  compassion: 'Compassion',
};

/** Guided prompts for one session: settle in, reflect, close with an intention. */
export type PromptSet = {
  id: string;
  theme: ReflectionTheme;
  settle: string;
  /** Shown in order; shorter sessions show the first ones only. */
  prompts: readonly string[];
  closing: string;
};

/** Today's Reflection: the same for every user on the same local date. */
export type DailyReflection = {
  date: DayKey;
  theme: ReflectionTheme;
  promptSetId: string;
  trackId: TrackId;
};

/** Stored with the alarm (JSON). Difficulty = session length, not intellectual difficulty. */
export type ReflectionMissionConfig = { difficulty: MissionDifficulty };

export type ReflectionMissionResult = {
  type: 'reflection';
  difficulty: MissionDifficulty;
  date: DayKey;
  theme: ReflectionTheme;
  promptSetId: string;
  /** The track that actually played (the fallback if the daily track wasn't on the phone). */
  trackId: TrackId;
  trackTitle: string;
  musicSource: TrackSourceKind;
  /** Planned session length, and how long it actually took (pauses excluded), in ms. */
  targetMs: number;
  durationMs: number;
};
