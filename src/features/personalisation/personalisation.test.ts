import { describe, expect, it, jest } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { COMPLETION_MODES, createAlarmDraft, type Alarm, type Weekday } from '@/features/alarms/alarm';
import { isModeAvailable } from '@/features/alarms/alarm-features';
import { createMemoryAlarmRepository } from '@/features/alarms/alarm-repository';
import { createAlarmStore, snoozeOffsetsFor } from '@/features/alarms/alarm-store';
import { MISSION_CATEGORIES } from '@/features/alarms/creation';
import { mainWakeUpIdForDate, resolvedMainWakeUp } from '@/features/alarms/main-wake-up';
import { featureChecker, FREE_STATE, isPremiumFeature } from '@/features/entitlements/entitlement';
import { FEATURE_KEYS } from '@/features/entitlements/features';
import { ACCESS_POLICY } from '@/features/entitlements/policy';
import { createFaithSettingsStore } from '@/features/faith/faith-settings';
import { FAITH_PREFERENCES } from '@/features/faith/types';
import { catalogueFor } from '@/features/missions/fitness/exercises';
import { MOBILITY_PROFILES } from '@/features/missions/fitness/types';
import { createMemoryNightRoutineRepository } from '@/features/night/night-repository';
import { createNightRoutineDraft, validateNightRoutine } from '@/features/night/night-routine';
import { createNightStore } from '@/features/night/night-store';
import { createAppPreferences } from '@/features/settings/preferences-store';
import { SETTINGS_GROUPS } from '@/features/settings/settings-index';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';
import type { AlarmService, AlarmSpec } from '@/services/alarm-scheduler';
import { unavailableScreenTime } from '@/services/screen-time';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { routineChanges } from './apply';
import { baselineAnswers, NO_GOALS, PERSONALISATION_DEFAULTS } from './baseline';
import {
  adjust,
  answer,
  isFirstStep,
  markWarned,
  needsSkipWarning,
  nextStep,
  ONBOARDING_STEPS,
  previousStep,
  progress,
  skipStep,
  startDraft,
  visibleSteps,
  type OnboardingDraft,
} from './flow';
import { MODE_EXPLANATION } from './labels';
import { createPersonalisation } from './personalisation-service';
import { buildPlan, suggestedTime, type RoutinePlan } from './plan';
import { alarmPlusReasons, BASIC_ALARM_SLOT, lockedReasons, planPlusReasons, PLUS_FEATURE } from './plan-entitlements';
import { buildPreview, describeDayRange } from './preview';
import {
  cameraEligible,
  categoryTitle,
  EDUCATION_GOALS,
  educationMission,
  faithGoals,
  faithMission,
  fitnessActivity,
  fitnessGoals,
  goalOptions,
  recommendedMission,
} from './recommend';
import { audienceFor, createPersonalisationStorage, DRAFT_KEY, normaliseDraft, PROFILE_KEY, STATE_KEY } from './storage';
import { DAY_PART_LABEL, DAY_PARTS, GENDERS, type GoalAnswer, type Goals, type PersonalisationAnswers } from './types';

// Wednesday 14 October 2026, 10:00 local time.
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h, 0).getTime();
const MONDAY = at(2026, 9, 19);
const SATURDAY = at(2026, 9, 17);
const SUNDAY = at(2026, 9, 18);

const goal = <T extends string>(id: T, mode: GoalAnswer['mode'] = 'reward', part: GoalAnswer['part'] = 'morning', time: GoalAnswer['time'] = null) =>
  ({ goal: id, mode, part, time }) as never;

function answers(change: Partial<PersonalisationAnswers> = {}): PersonalisationAnswers {
  return {
    ...baselineAnswers({ alarms: [], night: null, faith: null, mobilityProfile: 'standard', now: NOW }),
    ...change,
  };
}

function draftWith(change: Partial<PersonalisationAnswers> = {}): OnboardingDraft {
  const base = answers();
  return { ...startDraft(base, NOW), answers: { ...base, ...change } };
}

/** The app's real stores, on in-memory storage. */
function setup(options: { alarms?: Alarm[] } = {}) {
  const repository = createMemoryAlarmRepository();
  const base = createNotImplementedAlarmService();
  const service: AlarmService = {
    ...base,
    schedule: jest.fn(async (_spec: AlarmSpec) => ({ status: 'scheduled' as const, nativeId: 'n' })),
    cancel: jest.fn(base.cancel),
  };
  let time = NOW;
  const alarmStore = createAlarmStore(async () => repository, service, { now: () => time++ });
  const nightRepository = createMemoryNightRoutineRepository();
  const nightStore = createNightStore({
    getRepository: async () => nightRepository,
    screenTime: unavailableScreenTime,
    alarms: () => alarmStore.getState().alarms,
    now: () => time,
  });
  const settings = createMemorySettingsStore();
  const faith = createFaithSettingsStore(settings);
  const prefs = createAppPreferences(settings);
  const storage = createPersonalisationStorage(settings);
  let occurrences = 0;
  const p = createPersonalisation({
    storage,
    targets: {
      alarms: alarmStore,
      night: nightStore,
      setFaith: (primary) => faith.update({ primary }),
      setMobilityProfile: (mobilityProfile) => prefs.accessibility.update({ mobilityProfile }),
    },
    async existingSetup() {
      await nightStore.load();
      return { alarms: (await repository.list()).length, occurrences, nightRoutine: nightStore.getState().routine !== null };
    },
    async current() {
      return { faith: (await faith.get()).primary, mobilityProfile: (await prefs.accessibility.get()).mobilityProfile };
    },
    now: () => time,
  });
  return {
    p,
    alarmStore,
    nightStore,
    repository,
    service,
    settings,
    faith,
    prefs,
    storage,
    setOccurrences: (n: number) => (occurrences = n),
    seed: async () => {
      for (const a of options.alarms ?? []) await repository.save(a);
      await alarmStore.load();
    },
  };
}

const existingAlarm = (overrides: Partial<Alarm> = {}): Alarm => ({
  ...createAlarmDraft({ hour: 7, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6], isPrimary: true, label: 'My alarm' }),
  id: 'mine',
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  ...overrides,
});

const primaries = (alarms: readonly Alarm[]) => alarms.filter((a) => a.isPrimary && a.enabled);

/** Every date in the next fortnight has at most one Main Wake-Up, and it's the one the plan expects. */
function oneMainPerDay(alarms: readonly Alarm[]) {
  for (let d = 0; d < 14; d++) {
    const day = at(2026, 9, 14 + d);
    const covering = primaries(alarms).filter((a) => a.weekdays.includes(new Date(day).getDay() as Weekday));
    expect(covering.length).toBeLessThanOrEqual(1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────

describe('flow: order, progress, back and forward', () => {
  it('keeps the required order: about → goals → modes → times → wake → sleep → review', () => {
    expect(ONBOARDING_STEPS).toEqual(['about', 'goals', 'modes', 'times', 'wake', 'sleep', 'review']);
  });

  it('shows modes and times only once a goal is chosen', () => {
    expect(visibleSteps(answers())).toEqual(['about', 'goals', 'wake', 'sleep', 'review']);
    expect(visibleSteps(answers({ goals: { ...NO_GOALS, fitness: goal('strength') } }))).toEqual(ONBOARDING_STEPS);
  });

  it('walks forward and back through the visible steps', () => {
    let d = draftWith({ goals: { ...NO_GOALS, education: goal('vocabulary') } });
    const seen = [d.step];
    while (d.step !== 'review') {
      d = nextStep(d);
      seen.push(d.step);
    }
    expect(seen).toEqual(ONBOARDING_STEPS);
    expect(nextStep(d).step).toBe('review');
    d = previousStep(previousStep(d));
    expect(d.step).toBe('wake');
    expect(isFirstStep(startDraft(answers(), NOW))).toBe(true);
    expect(previousStep(startDraft(answers(), NOW)).step).toBe('about');
  });

  it('skips the mode and time steps going forward and back when there are no goals', () => {
    let d: OnboardingDraft = { ...draftWith(), step: 'goals' };
    d = nextStep(d);
    expect(d.step).toBe('wake');
    expect(previousStep(d).step).toBe('goals');
  });

  it('progress is a light fraction from 0 to 1, never a long step count', () => {
    const d = draftWith({ goals: { ...NO_GOALS, faith: goal('reflection_habit') } });
    expect(progress(d)).toEqual({ index: 0, total: 7, fraction: 0 });
    expect(progress({ ...d, step: 'review' }).fraction).toBe(1);
    expect(progress({ ...d, step: 'times' }).fraction).toBeCloseTo(0.5);
  });

  it('Adjust from the review opens one step and Continue returns to the review', () => {
    const d = adjust({ ...draftWith(), step: 'review' }, 'wake');
    expect(d.step).toBe('wake');
    const back = nextStep(d);
    expect(back).toMatchObject({ step: 'review', returnToReview: false });
  });

  it('resumes an interrupted session from the phone, at the same step with the same answers', async () => {
    const { p, storage } = setup();
    let d = await p.begin();
    d = nextStep(answer(d, { gender: 'woman' }));
    await p.saveDraft(d);
    const resumed = await p.begin();
    expect(resumed.step).toBe('goals');
    expect(resumed.answers.gender).toBe('woman');
    expect(await p.hasDraft()).toBe(true);
    expect(normaliseDraft(await storage.getDraft())).toEqual(resumed);
  });

  it('a damaged or older saved session is discarded (starts again) instead of crashing', () => {
    expect(normaliseDraft(null)).toBeNull();
    expect(normaliseDraft({ version: 0, step: 'goals' })).toBeNull();
    expect(normaliseDraft({ version: 1, step: 'nowhere' })).toBeNull();
    const repaired = normaliseDraft({ version: 1, step: 'wake', answers: { wake: { weekday: { hour: 99 } } } })!;
    expect(repaired.answers.wake.weekday).toEqual(PERSONALISATION_DEFAULTS.wake);
  });

  it('completion clears the session and records the version', async () => {
    const { p, storage } = setup();
    await p.accept(await p.begin());
    expect(await storage.getDraft()).toBeNull();
    expect(await p.state()).toMatchObject({ status: 'completed', completedVersion: 1, completedAt: expect.any(Number) });
  });
});

describe('skip', () => {
  it('warns once per step, then skips silently', () => {
    let d = draftWith();
    expect(needsSkipWarning(d)).toBe(true);
    d = markWarned(d); // "Continue setup"
    expect(needsSkipWarning(d)).toBe(false);
    d = skipStep(d);
    expect(d.step).toBe('goals');
    expect(d.skipped).toEqual(['about']);
    // Coming back to a skipped step never warns again this session.
    expect(needsSkipWarning(previousStep(d))).toBe(false);
    expect(needsSkipWarning(d)).toBe(true);
  });

  it('skipped steps use safe defaults, never invented traits', () => {
    const d = draftWith({ gender: 'man', faith: 'islam', goals: { ...NO_GOALS, fitness: goal('strength', 'gentle', 'night', { hour: 20, minute: 0 }) } });
    expect(skipStep({ ...d, step: 'about' }).answers).toMatchObject({ gender: null, faith: d.baseline.faith, mobilityProfile: d.baseline.mobilityProfile });
    expect(skipStep({ ...d, step: 'goals' }).answers.goals).toEqual(NO_GOALS);
    expect(skipStep({ ...d, step: 'modes' }).answers.goals.fitness).toMatchObject({ mode: 'reward' });
    expect(skipStep({ ...d, step: 'times' }).answers.goals.fitness).toMatchObject({ part: 'morning', time: null });
    expect(skipStep({ ...d, step: 'wake' }).answers.wake).toEqual(d.baseline.wake);
    expect(skipStep({ ...d, step: 'sleep' }).answers.sleep).toBeNull();
  });

  it('answering a skipped step again un-skips it', () => {
    let d = skipStep(draftWith());
    d = answer(previousStep(d), { gender: 'woman' });
    expect(d.skipped).toEqual([]);
  });

  it('skipping every step still produces a usable routine with the defaults (10 min × 3 snooze)', () => {
    let d = startDraft(answers(), NOW);
    while (d.step !== 'review') d = skipStep(d);
    const plan = buildPlan(d.answers);
    expect(plan.alarms).toHaveLength(1);
    expect(plan.alarms[0].draft).toMatchObject({ hour: 6, minute: 30, isPrimary: true, completionMode: 'reward', snooze: { enabled: true, minutes: 10, maxSnoozes: 3 } });
    expect(plan.night).toBeNull();
  });

  it('skipping the whole onboarding changes nothing and the app stays usable', async () => {
    const mine = existingAlarm();
    const ctx = setup({ alarms: [mine] });
    await ctx.seed();
    await ctx.p.saveDraft(await ctx.p.begin());
    await ctx.p.skipAll();
    expect(await ctx.p.state()).toMatchObject({ status: 'skipped' });
    expect(await ctx.storage.getDraft()).toBeNull();
    expect(ctx.alarmStore.getState().alarms).toEqual([mine]);
    // The normal alarm flow still works.
    await ctx.alarmStore.save(createAlarmDraft({ hour: 9, minute: 0 }));
    expect(ctx.alarmStore.getState().alarms).toHaveLength(2);
  });

  it('skipping after completing keeps "completed"', async () => {
    const { p } = setup();
    await p.accept(await p.begin());
    await p.skipAll();
    expect((await p.state()).status).toBe('completed');
  });
});

describe('profile: gender, Faith, Mobility', () => {
  it('offers a respectful set of genders including not saying', () => {
    expect(GENDERS).toEqual(['woman', 'man', 'non_binary', 'prefer_not_to_say']);
  });

  it('gender never changes the generated routine or recommendations', () => {
    const base = answers({ goals: { education: goal('thinking'), fitness: goal('strength', 'challenge'), faith: goal('reflection_habit', 'gentle', 'night') } });
    const plans = [null, ...GENDERS].map((gender) => buildPlan({ ...base, gender }));
    for (const plan of plans) expect(plan).toEqual(plans[0]);
  });

  it('Faith and Mobility are reused from Settings, and written back only on acceptance', async () => {
    const ctx = setup();
    await ctx.faith.update({ primary: 'christianity' });
    await ctx.prefs.accessibility.update({ mobilityProfile: 'reduced_mobility' });
    let d = await ctx.p.begin();
    expect(d.answers).toMatchObject({ faith: 'christianity', mobilityProfile: 'reduced_mobility' });
    d = answer(d, { faith: 'hinduism', mobilityProfile: 'non_physical' });
    await ctx.p.saveDraft(d);
    await ctx.p.review(d);
    expect((await ctx.faith.get()).primary).toBe('christianity'); // not yet
    await ctx.p.accept(d);
    expect((await ctx.faith.get()).primary).toBe('hinduism');
    expect((await ctx.prefs.accessibility.get()).mobilityProfile).toBe('non_physical');
  });

  it('stores only gender, goals and sleep targets as new profile data (Faith and Mobility are not duplicated)', async () => {
    const ctx = setup();
    const d = answer(await ctx.p.begin(), { gender: 'non_binary', faith: 'buddhism', goals: { ...NO_GOALS, faith: goal('recitation') } });
    await ctx.p.accept(d);
    const raw = await ctx.settings.get<Record<string, unknown>>(PROFILE_KEY);
    expect(Object.keys(raw!).sort()).toEqual(['gender', 'goals', 'sleep']);
    expect(JSON.stringify(raw)).not.toMatch(/buddhism|faith"?:\s*"|mobility/i);
    expect(JSON.stringify(await ctx.settings.get(STATE_KEY))).not.toMatch(/buddhism|non_binary/);
  });

  it('Mobility Profile changes the Fitness catalogue and camera eligibility, not XP-relevant difficulty', () => {
    for (const profile of MOBILITY_PROFILES) {
      for (const g of fitnessGoals(profile)) {
        expect(catalogueFor(profile)).toContain(fitnessActivity(g.id, profile));
        const mission = recommendedMission('fitness', g.id, { mobilityProfile: profile, faith: null });
        expect(mission).toMatchObject({ type: 'fitness', difficulty: 'easy' });
      }
    }
    expect(cameraEligible('strength', 'standard')).toBe(true); // squats
    expect(cameraEligible('strength', 'reduced_mobility')).toBe(true); // chair sit-to-stand
    expect(cameraEligible('flexibility', 'standard')).toBe(false); // stretching isn't camera-counted
    for (const g of fitnessGoals('non_physical')) expect(cameraEligible(g.id, 'non_physical')).toBe(false);
  });
});

describe('goals → missions (deterministic, existing catalogue only)', () => {
  const standard = { mobilityProfile: 'standard' as const, faith: null };

  it('Education goals map onto Maths or the curated quiz packs', () => {
    expect(EDUCATION_GOALS.map((g) => [g.id, educationMission(g.id)])).toEqual([
      ['general_knowledge', { type: 'quiz', category: 'general', difficulty: 'easy', questionCount: 3 }],
      ['geography', { type: 'quiz', category: 'geography', difficulty: 'easy', questionCount: 3 }],
      ['vocabulary', { type: 'quiz', category: 'vocabulary', difficulty: 'easy', questionCount: 3 }],
      ['thinking', { type: 'quiz', category: 'logic', difficulty: 'easy', questionCount: 3 }],
      ['numbers', { type: 'math', difficulty: 'easy', questionCount: 3 }],
    ]);
  });

  it('Fitness goals follow the Mobility Profile', () => {
    expect(fitnessActivity('strength', 'standard')).toBe('squats');
    expect(fitnessActivity('strength', 'reduced_mobility')).toBe('chair_sit_to_stand');
    expect(fitnessActivity('move_daily', 'reduced_mobility')).toBe('seated_marching');
    expect(fitnessGoals('non_physical').map((g) => fitnessActivity(g.id, 'non_physical'))).toEqual(['controlled_breathing', 'number_focus', 'hold_release', 'grounding']);
    // A goal from another profile falls back safely to the profile's own catalogue.
    expect(catalogueFor('non_physical')).toContain(fitnessActivity('strength', 'non_physical'));
    expect(categoryTitle('fitness', { mobilityProfile: 'non_physical', faith: null })).toBe('Wake-up activity');
  });

  it('Faith goals adapt to the Faith preference; no tradition means reflection language', () => {
    expect(faithGoals('islam').map((g) => g.id)).toEqual(['recitation', 'reflection', 'recitation_reflection']);
    expect(faithMission('recitation', 'islam')).toEqual({ type: 'recitation', tradition: 'islam' });
    expect(faithMission('recitation_reflection', 'hinduism')).toEqual({ type: 'recitation_reflection', tradition: 'hinduism', difficulty: 'easy' });
    for (const preference of ['non_religious', 'prefer_not_to_say', null] as const) {
      expect(faithGoals(preference).map((g) => g.id)).toEqual(['reflection_habit', 'mindful_start']);
      expect(faithGoals(preference).some((g) => /recit|pray/i.test(g.title))).toBe(false);
      expect(categoryTitle('faith', { mobilityProfile: 'standard', faith: preference })).toBe('Reflection');
    }
    // A Recitation goal without a tradition can never create a Recitation.
    expect(faithMission('recitation', 'non_religious')).toEqual({ type: 'reflection', difficulty: 'easy' });
  });

  it('every option for every profile and faith maps to a mission (nothing invented)', () => {
    for (const mobilityProfile of MOBILITY_PROFILES) {
      for (const faith of [...FAITH_PREFERENCES, null]) {
        for (const category of MISSION_CATEGORIES) {
          for (const o of goalOptions(category, { mobilityProfile, faith })) {
            expect(recommendedMission(category, o.id, { mobilityProfile, faith }).type).not.toBe('none');
          }
        }
      }
    }
  });

  it('a category can be skipped (Education + Faith, no Fitness)', () => {
    const plan = buildPlan(answers({ faith: 'islam', goals: { education: goal('vocabulary'), fitness: null, faith: goal('recitation', 'gentle', 'night') } }));
    expect(plan.goals.map((g) => g.category)).toEqual(['education', 'faith']);
    expect(plan.alarms.some((a) => a.draft.mission.type === 'fitness')).toBe(false);
  });

  it('recommendations are identical every time (deterministic)', () => {
    const a = answers({ goals: { education: goal('geography'), fitness: goal('more_active'), faith: goal('mindful_start') } });
    expect(buildPlan(a)).toEqual(buildPlan(a));
    expect(goalOptions('education', standard)).toEqual(goalOptions('education', standard));
  });
});

describe('accountability modes', () => {
  it('are always ordered Gentle → Reward → Challenge, everywhere', () => {
    expect(COMPLETION_MODES).toEqual(['gentle', 'reward', 'challenge']);
    expect(Object.keys(MODE_EXPLANATION)).toEqual(['gentle', 'reward', 'challenge']);
    const screen = readFileSync(join(__dirname, 'components', 'steps.tsx'), 'utf8');
    expect(screen).toMatch(/COMPLETION_MODES\.map/);
  });

  it('explanations come from the real policies (2 h Reward window, 1 h Challenge)', () => {
    expect(MODE_EXPLANATION.reward.summary).toContain('2 hours');
    expect(MODE_EXPLANATION.challenge.summary).toContain('1 hour');
    expect(MODE_EXPLANATION.gentle.summary).toMatch(/reminds you/);
  });

  it('each goal keeps its own mode on its own alarm', () => {
    const plan = buildPlan(
      answers({ goals: { education: goal('thinking', 'reward', 'day'), fitness: goal('strength', 'challenge'), faith: goal('reflection_habit', 'gentle', 'night') } }),
    );
    const modeOf = (c: string) => plan.alarms.find((a) => a.category === c)!.draft.completionMode;
    expect([modeOf('education'), modeOf('fitness'), modeOf('faith')]).toEqual(['reward', 'challenge', 'gentle']);
  });

  it('Challenge is premium-ready: the entitlement layer still decides it', () => {
    const steps = readFileSync(join(__dirname, 'components', 'steps.tsx'), 'utf8');
    expect(steps).toMatch(/isModeAvailable\(mode, has\)/);
    expect(steps).toMatch(/Terbit\+/);
  });
});

describe('Morning / Afternoon / Night', () => {
  it('uses exactly these labels, in this order', () => {
    expect(DAY_PARTS.map((p) => DAY_PART_LABEL[p])).toEqual(['Morning', 'Afternoon', 'Night']);
  });

  it('the first Morning goal is the Main Wake-Up mission; others are ordinary alarms after it', () => {
    const plan = buildPlan(answers({ goals: { education: goal('vocabulary'), fitness: goal('strength'), faith: null }, wake: { ...answers().wake, weekend: 'same' } }));
    const mains = plan.alarms.filter((a) => a.draft.isPrimary);
    expect(mains).toHaveLength(1);
    expect(mains[0].draft.mission).toMatchObject({ type: 'quiz', category: 'vocabulary' });
    const extra = plan.alarms.find((a) => a.slot === 'morning:fitness:weekday')!;
    expect(extra.draft).toMatchObject({ hour: 6, minute: 45, isPrimary: false });
  });

  it('Afternoon and Night goals are never Main Wake-Ups and use the suggested or chosen time', () => {
    const plan = buildPlan(
      answers({ goals: { education: goal('thinking', 'reward', 'day'), fitness: null, faith: goal('reflection_habit', 'gentle', 'night', { hour: 21, minute: 15 }) } }),
    );
    expect(plan.alarms.filter((a) => a.draft.isPrimary)).toHaveLength(1); // the every-day wake-up only
    expect(plan.alarms.find((a) => a.slot === 'goal:education')!.draft).toMatchObject({ hour: 12, minute: 30, isPrimary: false });
    expect(plan.alarms.find((a) => a.slot === 'goal:faith')!.draft).toMatchObject({ hour: 21, minute: 15, isPrimary: false });
  });

  it('a Night suggestion sits 30 minutes before wind-down (21:00 without a Night Routine)', () => {
    expect(suggestedTime('night', { windDown: { hour: 22, minute: 30 }, bedtime: { hour: 23, minute: 0 } })).toEqual({ hour: 22, minute: 0 });
    expect(suggestedTime('night', { windDown: { hour: 0, minute: 15 }, bedtime: { hour: 0, minute: 45 } })).toEqual({ hour: 23, minute: 45 });
    expect(suggestedTime('night', null)).toEqual({ hour: 21, minute: 0 });
  });

  it('two goals at the same time are spaced apart', () => {
    const plan = buildPlan(answers({ goals: { education: goal('thinking', 'reward', 'day'), fitness: goal('strength', 'reward', 'day'), faith: null } }));
    const times = plan.alarms.filter((a) => a.slot.startsWith('goal:')).map((a) => `${a.draft.hour}:${a.draft.minute}`);
    expect(times).toEqual(['12:30', '12:45']);
  });
});

describe('wake-up and snooze', () => {
  const wake = (change: Partial<PersonalisationAnswers['wake']>) => answers({ wake: { ...answers().wake, ...change } });

  it('weekday and weekend Main Wake-Ups never overlap (one Main Wake-Up per day)', () => {
    const plan = buildPlan(wake({ weekday: { hour: 6, minute: 30 }, weekend: 'different', weekendTime: { hour: 8, minute: 0 } }));
    const mains = plan.alarms.filter((a) => a.draft.isPrimary);
    expect(mains.map((m) => [m.slot, m.draft.weekdays, m.draft.hour, m.draft.minute])).toEqual([
      ['wake:weekday', [1, 2, 3, 4, 5], 6, 30],
      ['wake:weekend', [0, 6], 8, 0],
    ]);
  });

  it('"same time" is one every-day Main Wake-Up; "no alarm" leaves weekends free', () => {
    expect(buildPlan(wake({ weekend: 'same' })).alarms.map((a) => a.draft.weekdays)).toEqual([[0, 1, 2, 3, 4, 5, 6]]);
    expect(buildPlan(wake({ weekend: 'off' })).alarms.map((a) => a.draft.weekdays)).toEqual([[1, 2, 3, 4, 5]]);
  });

  it('snooze settings go on the Main Wake-Up, and only it snoozes natively', () => {
    const plan = buildPlan(
      answers({ wake: { ...answers().wake, snooze: { enabled: true, minutes: 5, maxSnoozes: 2 } }, goals: { ...NO_GOALS, education: goal('thinking'), fitness: goal('strength') } }),
    );
    const main = plan.alarms.find((a) => a.slot === 'wake:weekday')!.draft;
    expect(main.snooze).toEqual({ enabled: true, minutes: 5, maxSnoozes: 2 });
    expect(snoozeOffsetsFor(main)).toEqual([5, 10]);
    expect(snoozeOffsetsFor(plan.alarms.find((a) => a.slot === 'morning:fitness:weekday')!.draft)).toEqual([]);
  });

  it('the saved alarms work with the central Main Wake-Up resolver', async () => {
    const ctx = setup();
    await ctx.p.accept(answer(await ctx.p.begin(), { wake: { ...answers().wake, weekend: 'different', weekendTime: { hour: 8, minute: 0 } } }));
    const alarms = ctx.alarmStore.getState().alarms;
    expect(resolvedMainWakeUp(alarms, MONDAY)).toMatchObject({ hour: 6, minute: 30 });
    expect(resolvedMainWakeUp(alarms, SATURDAY)).toMatchObject({ hour: 8, minute: 0 });
    expect(resolvedMainWakeUp(alarms, SUNDAY)).toMatchObject({ hour: 8, minute: 0 });
    oneMainPerDay(alarms);
  });

  it('prefills from the phone’s current Main Wake-Ups', () => {
    const weekday = existingAlarm({ id: 'wd', weekdays: [1, 2, 3, 4, 5], hour: 6, minute: 15, snooze: { enabled: true, minutes: 15, maxSnoozes: 1 } });
    const weekend = existingAlarm({ id: 'we', weekdays: [0, 6], hour: 9, minute: 0 });
    const base = baselineAnswers({ alarms: [weekday, weekend], night: null, faith: null, mobilityProfile: 'standard', now: NOW });
    expect(base.wake).toEqual({ weekday: { hour: 6, minute: 15 }, weekend: 'different', weekendTime: { hour: 9, minute: 0 }, snooze: { enabled: true, minutes: 15, maxSnoozes: 1 } });
    expect(baselineAnswers({ alarms: [weekday], night: null, faith: null, mobilityProfile: 'standard', now: NOW }).wake.weekend).toBe('off');
  });
});

describe('sleep targets vs the Night Routine', () => {
  const sleep = { windDown: { hour: 22, minute: 30 }, bedtime: { hour: 23, minute: 0 } };

  it('continuing through the sleep step saves the targets but never creates a Night Routine', async () => {
    const ctx = setup();
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep }));
    expect(ctx.nightStore.getState().routine).toBeNull();
    expect((await ctx.storage.getProfile())?.sleep).toEqual(sleep);
  });

  it('keeps wind-down and bedtime separate when the user explicitly adds a Night Routine', async () => {
    const ctx = setup();
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep, nightRoutine: true }));
    expect(ctx.nightStore.getState().routine).toMatchObject({ windDown: sleep.windDown, bedtime: sleep.bedtime, enabled: true });
  });

  it('an existing Night Routine is preserved unless the user chooses to update it', async () => {
    const ctx = setup();
    const before = await ctx.nightStore.save(createNightRoutineDraft({ weekdays: [0, 1, 2, 3, 4], activity: 'breathing', windDownReminder: false }));
    const later = { windDown: { hour: 21, minute: 45 }, bedtime: { hour: 22, minute: 30 } };
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep: later }));
    expect(ctx.nightStore.getState().routine).toEqual(before);
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep: later, nightRoutine: true }));
    expect(ctx.nightStore.getState().routine).toMatchObject({ weekdays: [0, 1, 2, 3, 4], activity: 'breathing', windDownReminder: false, ...later });
  });

  it('the Night Routine choice is off at the start of every session', async () => {
    const ctx = setup();
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep, nightRoutine: true }));
    expect((await ctx.p.begin()).answers.nightRoutine).toBe(false);
  });

  it('a rerun starts from the saved targets, not from the Night Routine', async () => {
    const ctx = setup();
    await ctx.nightStore.save(createNightRoutineDraft());
    const mine = { windDown: { hour: 23, minute: 0 }, bedtime: { hour: 23, minute: 45 } };
    await ctx.p.accept(answer(await ctx.p.begin(), { sleep: mine }));
    expect((await ctx.p.begin()).answers.sleep).toEqual(mine);
  });

  it('the preview shows the targets and the Available Sleep Window even without a Night Routine', () => {
    const preview = buildPreview(buildPlan(answers({ sleep, wake: { ...answers().wake, weekend: 'different', weekendTime: { hour: 8, minute: 0 } } })));
    expect(preview.night).toEqual({
      windDown: '22:30',
      bedtime: '23:00',
      nightRoutine: false,
      plus: [],
      availableSleepWindow: [
        { nights: 'Sun–Thu nights', duration: '7h 30m' },
        { nights: 'Fri–Sat nights', duration: '9h' },
      ],
    });
    expect(buildPreview(buildPlan(answers({ sleep, nightRoutine: true }))).night).toMatchObject({ nightRoutine: true, plus: ['night_routine'] });
  });

  it('sleep targets still set the Night suggestion without a Night Routine', () => {
    const plan = buildPlan(answers({ sleep, goals: { ...NO_GOALS, faith: goal('reflection_habit', 'gentle', 'night') } }));
    expect(plan.night).toBeNull();
    expect(plan.alarms.find((a) => a.slot === 'goal:faith')!.draft).toMatchObject({ hour: 22, minute: 0 });
  });

  it('skipping sleep leaves any Night Routine untouched (and creates none)', async () => {
    const ctx = setup();
    let d: OnboardingDraft = { ...(await ctx.p.begin()), step: 'sleep' };
    d = answer(d, { nightRoutine: true });
    d = skipStep(d);
    expect(d.answers).toMatchObject({ sleep: null, nightRoutine: false });
    await ctx.p.accept(d);
    expect(ctx.nightStore.getState().routine).toBeNull();
  });

  it('generated Night Routines are valid', () => {
    expect(validateNightRoutine(createNightRoutineDraft(sleep))).toEqual([]);
  });
});

describe('Terbit+ readiness of the generated routine (no gating in 6A)', () => {
  const full = answers({
    faith: 'islam',
    goals: { education: goal('thinking', 'reward', 'day'), fitness: goal('strength', 'challenge'), faith: goal('recitation', 'gentle', 'night') },
    wake: { ...answers().wake, weekend: 'different', weekendTime: { hour: 8, minute: 0 } },
    sleep: { windDown: { hour: 22, minute: 30 }, bedtime: { hour: 23, minute: 0 } },
    nightRoutine: true,
  });

  it('the Free routine is one basic alarm: a Gentle/Reward, Easy Main Wake-Up, with no Night Routine', () => {
    const plan = buildPlan(answers({ goals: { ...NO_GOALS, education: goal('vocabulary', 'gentle') } }));
    expect(plan.alarms.map((a) => a.slot)).toEqual([BASIC_ALARM_SLOT]);
    expect(planPlusReasons(plan)).toEqual({ alarms: { 'wake:weekday': [] }, night: [], free: true });
  });

  it('marks Challenge, extra alarms and the Night Routine as Terbit+', () => {
    const plus = planPlusReasons(buildPlan(full));
    expect(plus.alarms).toEqual({
      'wake:weekday': ['challenge'],
      'wake:weekend': ['challenge', 'extra_alarm'],
      'goal:education': ['extra_alarm'],
      'goal:faith': ['extra_alarm'],
    });
    expect(plus.night).toEqual(['night_routine']);
    expect(plus.free).toBe(false);
  });

  it('marks Medium/Hard difficulty as Terbit+ (recommendations stay Easy)', () => {
    const plan = buildPlan(answers({ goals: { ...NO_GOALS, education: goal('thinking') } }));
    const item = { ...plan.alarms[0], draft: { ...plan.alarms[0].draft, mission: { type: 'quiz' as const, category: 'logic' as const, difficulty: 'hard' as const, questionCount: 3 as const } } };
    expect(alarmPlusReasons(item)).toEqual(['difficulty']);
    expect(plan.alarms.every((a) => alarmPlusReasons(a).length === 0)).toBe(true);
  });

  it('content follows the access policy, so content marked premium later is flagged with no engine change', () => {
    const [main] = buildPlan(answers({ goals: { ...NO_GOALS, education: goal('thinking') } })).alarms;
    const strict = { ...ACCESS_POLICY, freeFeatures: ACCESS_POLICY.freeFeatures.filter((f) => f !== 'basic_missions') };
    expect(alarmPlusReasons(main, strict)).toEqual(['premium_content']);
  });

  it('what a user would see locked depends only on their entitlement', () => {
    const reasons = planPlusReasons(buildPlan(full)).alarms['wake:weekend']!;
    expect(lockedReasons(reasons, featureChecker(FREE_STATE, NOW))).toEqual(['challenge', 'extra_alarm']);
    expect(lockedReasons(reasons, featureChecker({ ...FREE_STATE, tier: 'premium' }, NOW))).toEqual([]);
  });

  it('every reason maps to a real entitlement feature that is premium under the current policy', () => {
    for (const feature of Object.values(PLUS_FEATURE)) {
      expect(FEATURE_KEYS).toContain(feature);
      expect(isPremiumFeature(feature)).toBe(true);
    }
  });

  it('the preview carries the reasons as data (6A shows no Terbit+ paywall or tags)', () => {
    const preview = buildPreview(buildPlan(full));
    expect(preview.groups[0].items.map((i) => i.plus)).toEqual([['challenge'], ['extra_alarm'], ['extra_alarm']]);
    const review = readFileSync(join(__dirname, 'components', 'review-step.tsx'), 'utf8');
    expect(review).not.toMatch(/\.plus\b|Terbit\+|paywall/i);
  });

  it('the full routine is still generated and saved in 6A (nothing is gated yet)', async () => {
    const ctx = setup();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    expect(ctx.alarmStore.getState().alarms).toHaveLength(4);
    expect(ctx.nightStore.getState().routine).not.toBeNull();
  });
});

describe('generated schedule', () => {
  const full = answers({
    faith: 'islam',
    goals: { education: goal('thinking', 'reward', 'day'), fitness: goal('strength', 'challenge'), faith: goal('recitation', 'gentle', 'night') },
    wake: { ...answers().wake, weekend: 'different', weekendTime: { hour: 8, minute: 0 } },
    sleep: { windDown: { hour: 22, minute: 30 }, bedtime: { hour: 23, minute: 0 } },
    nightRoutine: true,
  });

  it('builds a readable weekly preview grouped by days (not hard-coded)', () => {
    const preview = buildPreview(buildPlan(full));
    expect(preview.groups.map((g) => [g.days, g.items.map((i) => `${i.time} ${i.title}`)])).toEqual([
      ['Mon–Fri', ['06:30 Main Wake-Up', '12:30 Education · Afternoon', '22:00 Faith · Night']],
      ['Sat–Sun', ['08:00 Main Wake-Up', '12:30 Education · Afternoon', '22:00 Faith · Night']],
    ]);
    const main = preview.groups[0].items[0];
    expect(main.detail).toMatch(/^Fitness · Challenge · Squats/);
    expect(main.snooze).toBe('10 min snooze × 3');
    expect(describeDayRange([0, 1, 2, 3, 4])).toBe('Sun–Thu');
    expect(describeDayRange([1, 3])).toBe('Mon, Wed');
  });

  it('accepting creates real alarms through the normal store (and native scheduling)', async () => {
    const ctx = setup();
    const d = { ...(await ctx.p.begin()), answers: full };
    await ctx.p.accept(d);
    const alarms = ctx.alarmStore.getState().alarms;
    expect(alarms).toHaveLength(4);
    expect(await ctx.repository.list()).toHaveLength(4);
    expect(ctx.service.schedule).toHaveBeenCalledTimes(4);
    oneMainPerDay(alarms);
  });

  it('cancelling (reviewing, then closing) changes nothing', async () => {
    const mine = existingAlarm();
    const ctx = setup({ alarms: [mine] });
    await ctx.seed();
    const d = { ...(await ctx.p.begin()), answers: full };
    await ctx.p.saveDraft(d);
    await ctx.p.review(d);
    await ctx.p.skipAll();
    expect(ctx.alarmStore.getState().alarms).toEqual([mine]);
    expect(ctx.nightStore.getState().routine).toBeNull();
    expect(ctx.service.schedule).not.toHaveBeenCalled();
  });

  it('running it again updates the same alarms (no duplicates of anything)', async () => {
    const ctx = setup();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    const first = ctx.alarmStore.getState().alarms.map((a) => a.id).sort();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: { ...full, wake: { ...full.wake, weekday: { hour: 6, minute: 0 } } } });
    const again = ctx.alarmStore.getState().alarms;
    expect(again.map((a) => a.id).sort()).toEqual(first);
    expect(again.find((a) => a.weekdays.join() === '1,2,3,4,5' && a.isPrimary)).toMatchObject({ hour: 6, minute: 0 });
    expect(primaries(again)).toHaveLength(2);
    oneMainPerDay(again);
  });

  it('a rerun with fewer goals removes only the alarms it generated before', async () => {
    const mine = existingAlarm({ id: 'own', isPrimary: false, hour: 19, minute: 0 });
    const ctx = setup({ alarms: [mine] });
    await ctx.seed();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: { ...full, goals: { ...full.goals, education: null, faith: null } } });
    const alarms = ctx.alarmStore.getState().alarms;
    expect(alarms.map((a) => a.id)).toContain('own');
    expect(alarms).toHaveLength(3); // own + two Main Wake-Ups
  });

  it('switching weekends from different to same (and back) never leaves two Main Wake-Ups on a day', async () => {
    const ctx = setup();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: { ...full, wake: { ...full.wake, weekend: 'same' } } });
    oneMainPerDay(ctx.alarmStore.getState().alarms);
    expect(primaries(ctx.alarmStore.getState().alarms)).toHaveLength(1);
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    oneMainPerDay(ctx.alarmStore.getState().alarms);
    expect(primaries(ctx.alarmStore.getState().alarms)).toHaveLength(2);
  });

  it('a generated alarm the user deleted is simply created again', async () => {
    const ctx = setup();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    const weekend = ctx.alarmStore.getState().alarms.find((a) => a.weekdays.join() === '0,6')!;
    await ctx.alarmStore.remove(weekend.id);
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    expect(ctx.alarmStore.getState().alarms).toHaveLength(4);
  });

  it('there is only ever one Night Routine', async () => {
    const ctx = setup();
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    await ctx.p.accept({ ...(await ctx.p.begin()), answers: full });
    expect(ctx.nightStore.getState().routine?.id).toBe('night');
  });
});

describe('existing users', () => {
  it('an install with alarms, history or a Night Routine is "existing" and never auto-offered', async () => {
    expect(audienceFor({ alarms: 0, occurrences: 0, nightRoutine: false })).toBe('new');
    expect(audienceFor({ alarms: 1, occurrences: 0, nightRoutine: false })).toBe('existing');
    expect(audienceFor({ alarms: 0, occurrences: 5, nightRoutine: false })).toBe('existing');
    expect(audienceFor({ alarms: 0, occurrences: 0, nightRoutine: true })).toBe('existing');

    const ctx = setup({ alarms: [existingAlarm()] });
    await ctx.seed();
    expect(await ctx.p.takeAutoOffer()).toBe(false);
    expect(await ctx.p.state()).toMatchObject({ audience: 'existing', status: 'not_started' });
  });

  it('history alone (all alarms since deleted) still counts as existing', async () => {
    const ctx = setup();
    ctx.setOccurrences(3);
    expect(await ctx.p.takeAutoOffer()).toBe(false);
  });

  it('a fresh install is offered personalisation exactly once', async () => {
    const ctx = setup();
    expect(await ctx.p.takeAutoOffer()).toBe(true);
    expect(await ctx.p.takeAutoOffer()).toBe(false);
    // Creating alarms later never turns a new install into a forced flow, or re-offers it.
    await ctx.alarmStore.save(createAlarmDraft());
    expect(await ctx.p.takeAutoOffer()).toBe(false);
  });

  it('nothing is written to an existing user’s alarms by just opening or reviewing', async () => {
    const mine = existingAlarm();
    const ctx = setup({ alarms: [mine] });
    await ctx.seed();
    const d = await ctx.p.begin();
    await ctx.p.review(d);
    expect(await ctx.repository.list()).toEqual([mine]);
  });

  it('explains what will change before replacing an existing Main Wake-Up', async () => {
    const mine = existingAlarm({ hour: 7, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    const plan = buildPlan(answers({ wake: { ...answers().wake, weekend: 'off' } }));
    const changes = routineChanges({
      plan,
      alarms: [mine],
      generated: {},
      night: null,
      current: { faith: null, mobilityProfile: 'standard' },
      answers: { faith: null, mobilityProfile: 'standard' },
      now: NOW,
    });
    expect(changes.replacesExisting).toBe(true);
    // Sleep targets alone never plan a Night Routine.
    expect(changes.lines.map((l) => l.kind)).toEqual(['add', 'main_trimmed']);
    expect(changes.lines[1].text).toMatch(/keeps only Saturday and Sunday/);
    expect(changes.untouched).toBe(0);
  });

  it('accepting uses the existing replacement rule: partial overlap subtracts days, history is kept', async () => {
    const mine = existingAlarm({ hour: 7, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    const ctx = setup({ alarms: [mine] });
    await ctx.seed();
    await ctx.p.accept(answer(await ctx.p.begin(), { wake: { ...answers().wake, weekend: 'off' } }));
    const alarms = ctx.alarmStore.getState().alarms;
    expect(alarms.find((a) => a.id === 'mine')).toMatchObject({ weekdays: [0, 6], isPrimary: true });
    expect(mainWakeUpIdForDate(alarms, MONDAY)).not.toBe('mine');
    oneMainPerDay(alarms);
  });

  it('a fully replaced Main Wake-Up is deleted and listed first; other alarms stay', async () => {
    const mine = existingAlarm({ weekdays: [1, 2, 3, 4, 5] });
    const other = existingAlarm({ id: 'evening', isPrimary: false, hour: 19, minute: 0, label: 'Evening' });
    const ctx = setup({ alarms: [mine, other] });
    await ctx.seed();
    const d = await ctx.p.begin();
    const { changes } = await ctx.p.review(d);
    expect(changes.lines.some((l) => l.kind === 'main_replaced')).toBe(true);
    expect(changes.untouched).toBe(1);
    await ctx.p.accept(d);
    const ids = ctx.alarmStore.getState().alarms.map((a) => a.id);
    expect(ids).not.toContain('mine');
    expect(ids).toContain('evening');
  });

  it('a new user with nothing set up needs no "replace" confirmation', async () => {
    const ctx = setup();
    const { changes } = await ctx.p.review(await ctx.p.begin());
    expect(changes.replacesExisting).toBe(false);
  });
});

const src = join(__dirname, '..', '..');

describe('privacy and local-first', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const path = join(dir, f);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

  it('Circles code never reads personalisation (gender, goals, sleep) or its storage keys', () => {
    for (const file of [...files(join(src, 'features', 'circles')), ...files(join(src, 'app', '(tabs)', 'circles'))]) {
      expect([file, /personalisation|PROFILE_KEY|gender/.test(readFileSync(file, 'utf8'))]).toEqual([file, false]);
    }
  });

  it('personalisation is not part of cloud backup (sync reads only Faith from settings)', () => {
    for (const file of files(join(src, 'features', 'sync'))) {
      expect([file, /personalisation/.test(readFileSync(file, 'utf8'))]).toEqual([file, false]);
    }
    expect(readFileSync(join(src, 'services', 'cloud', 'supabase-cloud.ts'), 'utf8')).not.toMatch(/gender|personalisation/);
  });

  it('personalisation never imports the cloud or network', () => {
    for (const file of files(__dirname).filter((f) => !f.endsWith('.test.ts'))) {
      expect([file, /services\/cloud|supabase|fetch\(/.test(readFileSync(file, 'utf8'))]).toEqual([file, false]);
    }
  });

  it('the storage keys are phone-only settings', () => {
    expect([STATE_KEY, PROFILE_KEY, DRAFT_KEY]).toEqual(['personalisation.state', 'personalisation.profile', 'personalisation.draft']);
  });

  it('works as a guest with no network: begin → accept with only local stores', async () => {
    const ctx = setup();
    await ctx.p.accept(answer(await ctx.p.begin(), { goals: { ...NO_GOALS, fitness: goal('move_daily') } }));
    expect(ctx.alarmStore.getState().alarms).toHaveLength(1);
  });
});

describe('regression', () => {
  it('generated alarms are ordinary alarms (missions, modes, snooze all as the editor would save them)', () => {
    const plan: RoutinePlan = buildPlan(answers({ goals: { ...NO_GOALS, fitness: goal('strength', 'gentle') } }));
    const [main] = plan.alarms;
    expect(main.draft).toEqual(
      createAlarmDraft({
        hour: 6,
        minute: 30,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        label: 'Daily wake-up',
        mission: { type: 'fitness', exercise: 'squats', difficulty: 'easy' },
        completionMode: 'gentle',
        snooze: { enabled: true, minutes: 10, maxSnoozes: 3 },
        isPrimary: true,
      }),
    );
  });

  it('labels fit the alarm label limit', () => {
    const plan = buildPlan(
      answers({ mobilityProfile: 'non_physical', goals: { education: goal('vocabulary'), fitness: goal('calm', 'reward', 'day'), faith: goal('mindful_start', 'reward', 'night') } }),
    );
    for (const a of plan.alarms) expect(a.draft.label.length).toBeLessThanOrEqual(40);
  });

  it('the launch route only offers personalisation when no alarm is opening', () => {
    const index = readFileSync(join(src, 'app', 'index.tsx'), 'utf8');
    expect(index).toMatch(/route === '\/today' && \(await personalisation\.takeAutoOffer\(\)/);
    expect(index).not.toMatch(/features\/circles/);
  });

  it('the onboarding modal is registered and can only be left through Close', () => {
    const layout = readFileSync(join(src, 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/name="personalise" options=\{\{ presentation: 'fullScreenModal', gestureEnabled: false \}\}/);
  });

  it('Settings has exactly one "Personalise Terbit" entry, with its own screen', () => {
    const rows = SETTINGS_GROUPS.flatMap((g) => g.rows).filter((r) => r.title === 'Personalise Terbit');
    expect(rows).toEqual([expect.objectContaining({ page: 'personalise', href: '/settings/personalise' })]);
    expect(readFileSync(join(src, 'app', '(tabs)', 'settings', 'personalise.tsx'), 'utf8')).toMatch(/router\.push\('\/personalise'\)/);
  });

  it('free keeps Gentle and Reward; Challenge stays premium-capable (Terbit+), entitlement tests unchanged', () => {
    expect(isPremiumFeature('gentle_mode')).toBe(false);
    expect(isPremiumFeature('reward_mode')).toBe(false);
    expect(isPremiumFeature('challenge_mode')).toBe(true);
    const free = featureChecker(FREE_STATE, NOW);
    expect(COMPLETION_MODES.filter((m) => isModeAvailable(m, free))).toEqual(['gentle', 'reward']);
  });

  it('Goals type covers every mission category', () => {
    const goals: Goals = NO_GOALS;
    expect(Object.keys(goals)).toEqual([...MISSION_CATEGORIES]);
  });
});
