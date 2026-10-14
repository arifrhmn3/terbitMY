import type { FaithPreference } from '@/features/faith/types';
import type { MobilityProfile } from '@/features/missions/fitness/types';

import { applyPlan, ensureLoaded, routineChanges, type ApplyResult, type ApplyTargets, type RoutineChanges } from './apply';
import { baselineAnswers } from './baseline';
import { ONBOARDING_VERSION, startDraft, type OnboardingDraft } from './flow';
import { buildPlan, type RoutinePlan } from './plan';
import { buildPreview, type RoutinePreview } from './preview';
import { audienceFor, type PersonalisationState, type PersonalisationStorage } from './storage';

/**
 * Personalisation for the app: when to offer it, resuming a session, the
 * proposed routine, and accepting it. Works offline and without an account
 * (nothing here touches the network or Supabase).
 */
export function createPersonalisation(deps: {
  storage: PersonalisationStorage;
  targets: ApplyTargets;
  /** What this install already has, to tell a new install from an existing one. */
  existingSetup: () => Promise<{ alarms: number; occurrences: number; nightRoutine: boolean }>;
  current: () => Promise<{ faith: FaithPreference | null; mobilityProfile: MobilityProfile }>;
  now?: () => number;
}) {
  const { storage, targets, existingSetup, current, now = Date.now } = deps;
  let deciding: Promise<PersonalisationState> | null = null;

  /**
   * The saved state. The first time it's read (the first launch with Phase
   * 6A), the install is classed once: with no alarms, history or Night
   * Routine it's 'new'; otherwise 'existing', which is never pushed into
   * onboarding. Nothing else about existing users changes.
   */
  function state(): Promise<PersonalisationState> {
    deciding ??= (async () => {
      const saved = await storage.getState();
      if (saved) return saved;
      const fresh: PersonalisationState = {
        audience: audienceFor(await existingSetup()),
        status: 'not_started',
        autoOffered: false,
        completedAt: null,
        completedVersion: null,
        generated: {},
      };
      await storage.setState(fresh);
      return fresh;
    })().finally(() => {
      deciding = null;
    });
    return deciding;
  }

  async function update(change: Partial<PersonalisationState>): Promise<PersonalisationState> {
    const next = { ...(await state()), ...change };
    await storage.setState(next);
    return next;
  }

  return {
    state,

    /**
     * Fresh installs only, once: whether to open onboarding at launch. It's
     * recorded straight away, so skipping (or closing the app) never brings it back.
     */
    async takeAutoOffer(): Promise<boolean> {
      const s = await state();
      if (s.audience !== 'new' || s.autoOffered || s.status !== 'not_started') return false;
      await update({ autoOffered: true });
      return true;
    },

    /** Resume an interrupted session, or start one from what the phone has now. */
    async begin(): Promise<OnboardingDraft> {
      // A saved session that can't be read is ignored: start a clean one rather than fail.
      const draft = await storage.getDraft().catch(() => null);
      if (draft) return draft;
      await ensureLoaded(targets);
      const [{ faith, mobilityProfile }, saved] = await Promise.all([current(), storage.getProfile()]);
      const baseline = baselineAnswers({
        alarms: targets.alarms.getState().alarms,
        night: targets.night.getState().routine,
        faith,
        mobilityProfile,
        saved,
        now: now(),
      });
      return startDraft(baseline, now());
    },

    saveDraft: (draft: OnboardingDraft) => storage.setDraft(draft),

    /** "Start again": forget the unfinished session (nothing else changes). */
    discardDraft: () => storage.setDraft(null),

    /** An unfinished session is waiting to be resumed. */
    hasDraft: async () => (await storage.getDraft()) !== null,

    /** Leave personalisation entirely (after the warning). Nothing is changed; Settings → Personalise Terbit stays available. */
    async skipAll() {
      await storage.setDraft(null);
      const s = await state();
      if (s.status !== 'completed') await update({ status: 'skipped' });
    },

    /** The proposed routine and what accepting it would change. Pure reads: nothing is saved. */
    async review(draft: OnboardingDraft): Promise<{ plan: RoutinePlan; preview: RoutinePreview; changes: RoutineChanges }> {
      await ensureLoaded(targets);
      const plan = buildPlan(draft.answers);
      const s = await state();
      return {
        plan,
        preview: buildPreview(plan),
        changes: routineChanges({
          plan,
          alarms: targets.alarms.getState().alarms,
          generated: s.generated,
          night: targets.night.getState().routine,
          current: await current(),
          answers: draft.answers,
          now: now(),
        }),
      };
    },

    /** "Use this routine": saves it for real, remembers what was generated, and ends the session. */
    async accept(draft: OnboardingDraft): Promise<ApplyResult> {
      const s = await state();
      const result = await applyPlan(buildPlan(draft.answers), draft.answers, s.generated, targets);
      await storage.setProfile({ gender: draft.answers.gender, goals: draft.answers.goals, sleep: draft.answers.sleep });
      await update({ status: 'completed', completedAt: now(), completedVersion: ONBOARDING_VERSION, generated: result.generated });
      await storage.setDraft(null);
      return result;
    },
  };
}

export type Personalisation = ReturnType<typeof createPersonalisation>;
