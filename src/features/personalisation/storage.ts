import type { CompletionMode, MaxSnoozes, SnoozeMinutes } from '@/features/alarms/alarm';
import { COMPLETION_MODES, MAX_SNOOZES, SNOOZE_MINUTES } from '@/features/alarms/alarm';
import { MISSION_CATEGORIES } from '@/features/alarms/creation';
import { isFaithPreference } from '@/features/faith/types';
import { MOBILITY_PROFILES, type MobilityProfile } from '@/features/missions/fitness/types';
import type { ClockTime } from '@/features/night/night-routine';
import { oneOf } from '@/features/settings/preference-store';
import type { SettingsStore } from '@/services/storage/settings';

import type { GeneratedAlarms } from './apply';
import { NO_GOALS, PERSONALISATION_DEFAULTS } from './baseline';
import { ONBOARDING_STEPS, ONBOARDING_VERSION, type OnboardingDraft, type OnboardingStep } from './flow';
import type { PlanSlot } from './plan';
import { DAY_PARTS, GENDERS, type Gender, type Goals, type PersonalisationAnswers, type SleepAnswer, type WeekendWake } from './types';

/**
 * Personalisation storage: three small JSON values in `app_settings`, on
 * this phone only. They are NOT part of cloud backup (the sync engine reads
 * only Faith from settings) and never reach Circles.
 *
 * - `personalisation.state`: audience (new or existing install), status,
 *   onboarding version, and which alarms Terbit generated (for safe reruns).
 * - `personalisation.profile`: gender, goals (mode + part of day per goal)
 *   and sleep targets (wind-down, bedtime). The only genuinely new personal
 *   data; everything else already has a home (Faith, Mobility, alarms,
 *   Night Routine) and isn't copied here. Sleep targets live here, apart
 *   from the Night Routine, so saving them never turns a Night Routine on.
 * - `personalisation.draft`: an unfinished session, so it resumes after an
 *   interruption. Removed when the session finishes or is exited.
 */
export const STATE_KEY = 'personalisation.state';
export const PROFILE_KEY = 'personalisation.profile';
export const DRAFT_KEY = 'personalisation.draft';

export type PersonalisationStatus = 'not_started' | 'skipped' | 'completed';

export type PersonalisationState = {
  /**
   * How this install first met personalisation: 'new' (nothing set up yet, so
   * onboarding is offered automatically once) or 'existing' (an install from
   * before Phase 6A with alarms, history or a Night Routine: never forced;
   * Settings → Personalise Terbit).
   */
  audience: 'new' | 'existing';
  status: PersonalisationStatus;
  /** The automatic first-launch offer was made (it's never made twice). */
  autoOffered: boolean;
  completedAt: number | null;
  completedVersion: number | null;
  generated: GeneratedAlarms;
};

export type PersonalisationProfile = { gender: Gender | null; goals: Goals; sleep: SleepAnswer | null };

const time = (value: unknown, fallback: ClockTime): ClockTime => {
  const t = value as Partial<ClockTime> | null;
  return t && Number.isInteger(t.hour) && Number.isInteger(t.minute) && t.hour! >= 0 && t.hour! < 24 && t.minute! >= 0 && t.minute! < 60
    ? { hour: t.hour!, minute: t.minute! }
    : fallback;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

export function normaliseState(value: unknown): PersonalisationState | null {
  const v = record(value);
  if (v.audience !== 'new' && v.audience !== 'existing') return null;
  const generated: GeneratedAlarms = {};
  for (const [slot, id] of Object.entries(record(v.generated))) {
    if (typeof id === 'string' && /^(wake:week(day|end)|morning:(education|fitness|faith):week(day|end)|goal:(education|fitness|faith))$/.test(slot)) {
      generated[slot as PlanSlot] = id;
    }
  }
  return {
    audience: v.audience,
    status: oneOf(v.status, ['not_started', 'skipped', 'completed'] as const, 'not_started'),
    autoOffered: v.autoOffered === true,
    completedAt: typeof v.completedAt === 'number' ? v.completedAt : null,
    completedVersion: typeof v.completedVersion === 'number' ? v.completedVersion : null,
    generated,
  };
}

export function normaliseGoals(value: unknown): Goals {
  const v = record(value);
  const goals: Goals = { ...NO_GOALS };
  for (const category of MISSION_CATEGORIES) {
    const g = v[category] ? record(v[category]) : null;
    if (!g || typeof g.goal !== 'string') continue;
    const part = oneOf(g.part, DAY_PARTS, PERSONALISATION_DEFAULTS.part);
    goals[category] = {
      // Checked against the current options when used (`validGoal`).
      goal: g.goal,
      mode: oneOf(g.mode, COMPLETION_MODES, PERSONALISATION_DEFAULTS.mode) as CompletionMode,
      part,
      time: g.time && part !== 'morning' ? time(g.time, { hour: 12, minute: 30 }) : null,
    } as never;
  }
  return goals;
}

export function normaliseProfile(value: unknown): PersonalisationProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = record(value);
  return { gender: GENDERS.includes(v.gender as Gender) ? (v.gender as Gender) : null, goals: normaliseGoals(v.goals), sleep: normaliseSleep(v.sleep) };
}

function normaliseSleep(value: unknown): SleepAnswer | null {
  if (!value || typeof value !== 'object') return null;
  const v = record(value);
  return { windDown: time(v.windDown, PERSONALISATION_DEFAULTS.sleep.windDown), bedtime: time(v.bedtime, PERSONALISATION_DEFAULTS.sleep.bedtime) };
}

export function normaliseAnswers(value: unknown): PersonalisationAnswers {
  const v = record(value);
  const wake = record(v.wake);
  const snooze = record(wake.snooze);
  return {
    gender: GENDERS.includes(v.gender as Gender) ? (v.gender as Gender) : null,
    faith: isFaithPreference(v.faith) ? v.faith : null,
    mobilityProfile: oneOf(v.mobilityProfile, MOBILITY_PROFILES, 'standard') as MobilityProfile,
    goals: normaliseGoals(v.goals),
    wake: {
      weekday: time(wake.weekday, PERSONALISATION_DEFAULTS.wake),
      weekend: oneOf(wake.weekend, ['same', 'different', 'off'] as const, 'same') as WeekendWake,
      weekendTime: time(wake.weekendTime, PERSONALISATION_DEFAULTS.weekendTime),
      snooze: {
        enabled: typeof snooze.enabled === 'boolean' ? snooze.enabled : PERSONALISATION_DEFAULTS.snooze.enabled,
        minutes: (SNOOZE_MINUTES.includes(snooze.minutes as SnoozeMinutes) ? snooze.minutes : PERSONALISATION_DEFAULTS.snooze.minutes) as SnoozeMinutes,
        maxSnoozes: (MAX_SNOOZES.includes(snooze.maxSnoozes as MaxSnoozes) ? snooze.maxSnoozes : PERSONALISATION_DEFAULTS.snooze.maxSnoozes) as MaxSnoozes,
      },
    },
    sleep: normaliseSleep(v.sleep),
    nightRoutine: v.nightRoutine === true,
  };
}

/** A saved session, or null if it's missing, damaged, or from another onboarding version (start again). */
export function normaliseDraft(value: unknown): OnboardingDraft | null {
  const v = record(value);
  if (v.version !== ONBOARDING_VERSION || !ONBOARDING_STEPS.includes(v.step as OnboardingStep)) return null;
  const steps = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is OnboardingStep => ONBOARDING_STEPS.includes(s)) : []);
  return {
    version: ONBOARDING_VERSION,
    step: v.step as OnboardingStep,
    answers: normaliseAnswers(v.answers),
    baseline: normaliseAnswers(v.baseline),
    skipped: steps(v.skipped),
    warned: steps(v.warned),
    returnToReview: v.returnToReview === true,
    startedAt: typeof v.startedAt === 'number' ? v.startedAt : 0,
  };
}

/** Whether this install already has a setup of its own (so it is an existing user, never pushed into onboarding). */
export function audienceFor(existing: { alarms: number; occurrences: number; nightRoutine: boolean }): 'new' | 'existing' {
  return existing.alarms > 0 || existing.occurrences > 0 || existing.nightRoutine ? 'existing' : 'new';
}

export function createPersonalisationStorage(store: SettingsStore) {
  return {
    async getState() {
      return normaliseState(await store.get(STATE_KEY));
    },
    async setState(state: PersonalisationState) {
      await store.set(STATE_KEY, state);
    },
    async getProfile() {
      return normaliseProfile(await store.get(PROFILE_KEY));
    },
    async setProfile(profile: PersonalisationProfile) {
      await store.set(PROFILE_KEY, profile);
    },
    async getDraft() {
      return normaliseDraft(await store.get(DRAFT_KEY));
    },
    async setDraft(draft: OnboardingDraft | null) {
      await store.set(DRAFT_KEY, draft);
    },
  };
}

export type PersonalisationStorage = ReturnType<typeof createPersonalisationStorage>;
