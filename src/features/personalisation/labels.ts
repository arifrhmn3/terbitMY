import type { CompletionMode } from '@/features/alarms/alarm';
import { MODE_POLICIES } from '@/features/alarms/accountability';
import { MISSION_WINDOW_MS } from '@/features/alarms/completion-policy';

import type { Gender } from './types';

export const GENDER_LABEL: Record<Gender, string> = {
  woman: 'Woman',
  man: 'Man',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
};

const hours = (ms: number) => {
  const h = ms / 3_600_000;
  return h === 1 ? '1 hour' : `${h} hours`;
};

/**
 * What each mode does, in product language, built from the real rules
 * (`MODE_POLICIES`, `MISSION_WINDOW_MS`) so it can't promise behaviour
 * that isn't implemented.
 */
export const MODE_EXPLANATION: Record<CompletionMode, { title: string; summary: string }> = {
  gentle: {
    title: MODE_POLICIES.gentle.label,
    summary: `Supportive, with more flexibility. Stop the alarm normally; if the mission isn’t done, Terbit reminds you a little later. You have until the end of the day.`,
  },
  reward: {
    title: MODE_POLICIES.reward.label,
    summary: `Complete the mission within the reward window (${hours(MISSION_WINDOW_MS.reward)} after the alarm) to earn its XP and streak.`,
  },
  challenge: {
    title: MODE_POLICIES.challenge.label,
    summary: `Stricter, for stronger commitment. The alarm leads straight into the mission, with a ${hours(MISSION_WINDOW_MS.challenge)} window.`,
  },
};

/** Privacy footers (each answer says where it goes). */
export const PRIVACY_NOTE = {
  gender: 'Private, on this phone only. It doesn’t change how Terbit works.',
  faith: 'Private. Used only to suggest Faith missions. Never shown in Circles or to anyone else.',
  mobility: 'Decides which Fitness activities Terbit suggests, and whether camera counting is offered. XP is the same for every profile.',
  goals: 'Your goals stay private on this phone. Circles never see them.',
} as const;
