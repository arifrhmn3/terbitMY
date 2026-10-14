import { MISSION_CATEGORIES } from '@/features/alarms/creation';

import { NO_GOALS, PERSONALISATION_DEFAULTS } from './baseline';
import type { Goals, PersonalisationAnswers } from './types';

/**
 * THE ONBOARDING ORDER (fixed by the product brief; don't reorder):
 *   1 about you (gender, faith, mobility) → 2 goals → 3 accountability mode
 *   → 4 time of day → 5 wake-up & snooze → 6 wind-down & bedtime → 7 review.
 * Screens combine related questions so it feels short. The flow is pure
 * data: the screen renders the current step and calls these functions.
 */
export type OnboardingStep = 'about' | 'goals' | 'modes' | 'times' | 'wake' | 'sleep' | 'review';
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['about', 'goals', 'modes', 'times', 'wake', 'sleep', 'review'];

/** Bump when the questions change enough to offer personalisation again. */
export const ONBOARDING_VERSION = 1;

export const STEP_TITLE: Record<OnboardingStep, string> = {
  about: 'About you',
  goals: 'Your goals',
  modes: 'How should Terbit keep you accountable?',
  times: 'When should Terbit hold you to it?',
  wake: 'Your wake-up',
  sleep: 'Your wind-down',
  review: 'Your Terbit routine',
};

/** An onboarding session in progress. Saved on the phone, so it resumes after an interruption. */
export type OnboardingDraft = {
  version: number;
  step: OnboardingStep;
  answers: PersonalisationAnswers;
  /** What the phone had when this session started: a skipped step returns to it. */
  baseline: PersonalisationAnswers;
  skipped: OnboardingStep[];
  /** Steps whose "Skip this step?" warning was already shown this session (never shown twice). */
  warned: OnboardingStep[];
  /** Opened from the review's Adjust: Continue goes straight back to the review. */
  returnToReview: boolean;
  startedAt: number;
};

export function startDraft(baseline: PersonalisationAnswers, now: number): OnboardingDraft {
  return { version: ONBOARDING_VERSION, step: 'about', answers: baseline, baseline, skipped: [], warned: [], returnToReview: false, startedAt: now };
}

export function hasGoals(goals: Goals): boolean {
  return MISSION_CATEGORIES.some((c) => goals[c] !== null);
}

/** The steps shown for these answers: modes and times only when there's at least one goal. */
export function visibleSteps(answers: PersonalisationAnswers): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((s) => (s === 'modes' || s === 'times' ? hasGoals(answers.goals) : true));
}

/** A light progress bar: how far along the visible steps (never "Step 3 of 17"). */
export function progress(draft: OnboardingDraft): { index: number; total: number; fraction: number } {
  const steps = visibleSteps(draft.answers);
  const index = Math.max(0, steps.indexOf(draft.step));
  return { index, total: steps.length, fraction: steps.length <= 1 ? 1 : index / (steps.length - 1) };
}

function move(draft: OnboardingDraft, delta: 1 | -1): OnboardingDraft {
  const steps = visibleSteps(draft.answers);
  const at = steps.indexOf(draft.step);
  // A step hidden by the latest answers (e.g. modes after removing every goal): continue from its place in the full order.
  const from = at >= 0 ? at : steps.findIndex((s) => ONBOARDING_STEPS.indexOf(s) > ONBOARDING_STEPS.indexOf(draft.step)) - (delta === 1 ? 1 : 0);
  const next = steps[Math.min(steps.length - 1, Math.max(0, from + delta))];
  return { ...draft, step: next };
}

/** Continue: the next step (or back to the review when adjusting from it). */
export function nextStep(draft: OnboardingDraft): OnboardingDraft {
  if (draft.returnToReview && draft.step !== 'review') return { ...draft, step: 'review', returnToReview: false };
  return move(draft, 1);
}

export function previousStep(draft: OnboardingDraft): OnboardingDraft {
  return move(draft, -1);
}

export function isFirstStep(draft: OnboardingDraft): boolean {
  return visibleSteps(draft.answers)[0] === draft.step;
}

/** Adjust from the review: open one step, then come straight back. */
export function adjust(draft: OnboardingDraft, step: Exclude<OnboardingStep, 'review'>): OnboardingDraft {
  return { ...draft, step, returnToReview: true };
}

/** Answering a step's questions (it no longer counts as skipped). */
export function answer(draft: OnboardingDraft, change: Partial<PersonalisationAnswers>): OnboardingDraft {
  return { ...draft, answers: { ...draft.answers, ...change }, skipped: draft.skipped.filter((s) => s !== draft.step) };
}

/** Whether tapping Skip on this step should first ask "Skip this step?" (only once per step, per session). */
export function needsSkipWarning(draft: OnboardingDraft): boolean {
  return draft.step !== 'review' && !draft.warned.includes(draft.step);
}

/** What a step's answers become when it's skipped: safe defaults, or the phone's current setup. */
export function skippedAnswers(step: OnboardingStep, answers: PersonalisationAnswers, baseline: PersonalisationAnswers): Partial<PersonalisationAnswers> {
  const eachGoal = (f: (g: NonNullable<Goals[keyof Goals]>) => object): Goals =>
    Object.fromEntries(MISSION_CATEGORIES.map((c) => [c, answers.goals[c] ? { ...answers.goals[c], ...f(answers.goals[c]!) } : null])) as Goals;
  switch (step) {
    case 'about':
      // Nothing changes: no gender, and Faith and Mobility stay as they are in Settings.
      return { gender: null, faith: baseline.faith, mobilityProfile: baseline.mobilityProfile };
    case 'goals':
      return { goals: { ...NO_GOALS } };
    case 'modes':
      return { goals: eachGoal(() => ({ mode: PERSONALISATION_DEFAULTS.mode })) };
    case 'times':
      return { goals: eachGoal(() => ({ part: PERSONALISATION_DEFAULTS.part, time: null })) };
    case 'wake':
      return { wake: baseline.wake };
    case 'sleep':
      // No sleep targets, and no Night Routine change.
      return { sleep: null, nightRoutine: false };
    case 'review':
      return {};
  }
}

/** Skip (after the warning, if one was due): safe defaults for this step, then the next step. */
export function skipStep(draft: OnboardingDraft): OnboardingDraft {
  if (draft.step === 'review') return draft;
  const skipped: OnboardingDraft = {
    ...draft,
    answers: { ...draft.answers, ...skippedAnswers(draft.step, draft.answers, draft.baseline) },
    skipped: [...new Set([...draft.skipped, draft.step])],
    warned: [...new Set([...draft.warned, draft.step])],
  };
  return nextStep(skipped);
}

/** The warning was shown and the user chose "Continue setup": don't warn about this step again. */
export function markWarned(draft: OnboardingDraft): OnboardingDraft {
  return { ...draft, warned: [...new Set([...draft.warned, draft.step])] };
}

/** The copy for skipping (supportive, no guilt). */
export const SKIP_COPY = {
  step: {
    title: 'Skip this step?',
    message: 'Terbit uses your answers to build a routine around your goals. You can always fine-tune alarms and routines yourself later.',
    continue: 'Continue setup',
    skip: 'Skip this step',
  },
  all: {
    title: 'Use Terbit without personalising?',
    message: 'You can use Terbit without personalisation, but you’ll need to set up your alarms and routines yourself. You can personalise any time from Settings.',
    continue: 'Continue setup',
    skip: 'Skip personalisation',
  },
} as const;
