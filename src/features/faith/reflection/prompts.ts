import type { PromptSet, ReflectionTheme } from './types';

/**
 * Guided prompts, written by Terbit for everyone (not tied to any religion).
 * One set per theme for now; a theme can gain more sets later (new IDs),
 * and the daily schedule chooses which set a date uses.
 */
export const PROMPT_SETS: readonly PromptSet[] = [
  {
    id: 'gratitude-1',
    theme: 'gratitude',
    settle: 'Sit comfortably. Let your breathing slow down on its own.',
    prompts: [
      'Bring to mind one thing from yesterday you are thankful for.',
      'Think of a person who made your life easier recently.',
      'Notice something simple you have right now: breath, rest, a new day.',
    ],
    closing: 'Carry one thank-you into today, and say it out loud to someone.',
  },
  {
    id: 'intention-1',
    theme: 'intention',
    settle: 'Breathe in slowly, and out a little more slowly.',
    prompts: [
      'What matters most to you today?',
      'Picture yourself at the end of the day, content. What did you do?',
      'Choose one small action that moves you towards it.',
    ],
    closing: 'Set your intention in a few words, and begin.',
  },
  {
    id: 'patience-1',
    theme: 'patience',
    settle: 'Let your shoulders drop. There is no rush in these few minutes.',
    prompts: [
      'Think of something that often makes you impatient.',
      'Imagine meeting it today with one calm breath first.',
      'Remember a time waiting turned out to be worth it.',
    ],
    closing: 'Today, when you feel hurried, pause for one breath.',
  },
  {
    id: 'calm-1',
    theme: 'calm',
    settle: 'Close your eyes if you like. Follow the music for a moment.',
    prompts: [
      'Notice where your body feels tense, and let it soften.',
      'With each breath out, let a little more go.',
      'Rest in the quiet between the sounds.',
    ],
    closing: 'Take this calm with you as you get up.',
  },
  {
    id: 'mindfulness-1',
    theme: 'mindfulness',
    settle: 'Feel the weight of your body where you are sitting or lying.',
    prompts: [
      'Notice three sounds around you.',
      'Notice the air moving in and out as you breathe.',
      'Notice one thought passing, and let it go by.',
    ],
    closing: 'Choose one ordinary moment today to do with full attention.',
  },
  {
    id: 'spiritual-reflection-1',
    theme: 'spiritual_reflection',
    settle: 'Settle into stillness. Let the morning be quiet for a moment.',
    prompts: [
      'What gives your life meaning?',
      'Where did you feel connected to something greater than yourself recently?',
      'What would living by your deepest values look like today?',
    ],
    closing: 'Begin today with that meaning in mind.',
  },
  {
    id: 'perspective-1',
    theme: 'perspective',
    settle: 'Breathe gently and let your thoughts slow down.',
    prompts: [
      'Think of a worry you woke up with.',
      'Will it matter in a week? In a year?',
      'What is one thing within your control about it?',
    ],
    closing: 'Hold today’s worries lightly, and act on what you can.',
  },
  {
    id: 'compassion-1',
    theme: 'compassion',
    settle: 'Rest your hands. Breathe in, and breathe out kindly.',
    prompts: [
      'Think of someone you care about, and wish them well.',
      'Think of someone you find difficult, and wish them well too.',
      'Offer yourself the same kindness.',
    ],
    closing: 'Look for one chance to be kind today.',
  },
];

export function findPromptSet(id: string): PromptSet | null {
  return PROMPT_SETS.find((p) => p.id === id) ?? null;
}

export function firstPromptSetFor(theme: ReflectionTheme): PromptSet {
  const set = PROMPT_SETS.find((p) => p.theme === theme);
  if (!set) throw new Error(`No prompts for ${theme}.`);
  return set;
}
