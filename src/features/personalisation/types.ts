import type { CompletionMode, MaxSnoozes, SnoozeMinutes } from '@/features/alarms/alarm';
import type { MissionCategory, RoutineContext } from '@/features/alarms/creation';
import type { FaithPreference } from '@/features/faith/types';
import type { MobilityProfile } from '@/features/missions/fitness/types';
import type { ClockTime } from '@/features/night/night-routine';

/**
 * PERSONALISATION (Phase 6A): "Tell us what you want to achieve, and we'll
 * build an accountability routine around you." The answers below are turned
 * into REAL alarms and a Night Routine (`plan.ts`, `apply.ts`); nothing here
 * is a separate, onboarding-only schedule.
 *
 * Privacy: every answer is private and stays on this phone. Gender and goals
 * are never synced, shared, or used by Circles (see docs/ARCHITECTURE.md →
 * Personalisation). Faith and Mobility are not stored here: they live in
 * their own stores and are only written there when a routine is accepted.
 */

/** Asked for basic personalisation only. It changes no behaviour anywhere in the app. */
export type Gender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
export const GENDERS: readonly Gender[] = ['woman', 'man', 'non_binary', 'prefer_not_to_say'];

export type EducationGoal = 'general_knowledge' | 'geography' | 'vocabulary' | 'thinking' | 'numbers';
/** Standard and Reduced mobility. */
export type MovementGoal = 'move_daily' | 'more_active' | 'strength' | 'flexibility';
/** Non-physical: accountability without movement (never called exercise). */
export type FocusGoal = 'calm' | 'focus' | 'release' | 'grounded';
export type FitnessGoal = MovementGoal | FocusGoal;
/** With a tradition (Islam, Christianity, Buddhism, Hinduism). */
export type TraditionFaithGoal = 'recitation' | 'reflection' | 'recitation_reflection';
/** Non-religious / Prefer not to say / not chosen: reflection language only. */
export type ReflectionGoal = 'reflection_habit' | 'mindful_start';
export type FaithGoal = TraditionFaithGoal | ReflectionGoal;

export type GoalId = { education: EducationGoal; fitness: FitnessGoal; faith: FaithGoal };

/**
 * The accountability context for a goal. Internally the routine contexts
 * already planned in `creation.ts` (morning / day / night); users always see
 * Morning / Afternoon / Night.
 */
export type DayPart = RoutineContext;
export const DAY_PARTS: readonly DayPart[] = ['morning', 'day', 'night'];
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'Morning', day: 'Afternoon', night: 'Night' };


/** One goal the user wants Terbit to hold them to. */
export type GoalAnswer<C extends MissionCategory = MissionCategory> = {
  goal: GoalId[C];
  mode: CompletionMode;
  part: DayPart;
  /** Afternoon / Night only: an exact time, or null for the suggested one. Morning follows the Main Wake-Up. */
  time: ClockTime | null;
};

export type Goals = { [C in MissionCategory]: GoalAnswer<C> | null };

/** What to do on Saturday and Sunday mornings. */
export type WeekendWake = 'same' | 'different' | 'off';

export type WakeAnswer = {
  weekday: ClockTime;
  weekend: WeekendWake;
  /** Used when `weekend` is 'different'. */
  weekendTime: ClockTime;
  snooze: { enabled: boolean; minutes: SnoozeMinutes; maxSnoozes: MaxSnoozes };
};

/** Night Routine: wind-down (digital quiet time begins) is NOT bedtime (the sleep target). */
export type SleepAnswer = { windDown: ClockTime; bedtime: ClockTime };

export type PersonalisationAnswers = {
  gender: Gender | null;
  /** Prefilled from Settings → Faith; written back only on acceptance. */
  faith: FaithPreference | null;
  /** Prefilled from Settings → Accessibility; written back only on acceptance. */
  mobilityProfile: MobilityProfile;
  goals: Goals;
  wake: WakeAnswer;
  /**
   * Sleep TARGETS (personalisation information, for the schedule, the
   * Available Sleep Window and future insights). Null when skipped. Saving
   * them never creates or changes a Night Routine by itself.
   */
  sleep: SleepAnswer | null;
  /**
   * The explicit choice to add (or update) the Night Routine with these
   * times. Off unless the user turns it on; an existing routine is
   * preserved otherwise. Night Routine is planned as Terbit+.
   */
  nightRoutine: boolean;
};
