import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAlarmDraft, describeMission, type AlarmMission } from '@/features/alarms/alarm';
import { completeMission, createOccurrence, markAlarmFired, startMission, type TransitionResult } from '@/features/alarms/occurrence';
import {
  activityForProfile,
  catalogueFor,
  EXERCISES,
  FITNESS_COUNTDOWN_MS,
  SEQUENCE_LENGTH,
} from '@/features/missions/fitness/exercises';
import {
  countdownLeft,
  createFitnessSession,
  currentCue,
  fitnessPhase,
  fitnessResult,
  recordHold,
  recordRep,
  startFitness,
  tapNumber,
  tickFitness,
  type FitnessSession,
} from '@/features/missions/fitness/session';
import { MOBILITY_PROFILES, type FitnessMissionConfig, type FitnessMissionResult, type MobilityProfile } from '@/features/missions/fitness/types';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { xpForMorning } from '@/features/progress/progression';
import { isLargeText } from '@/hooks/use-large-text';
import { screenAnimation } from '@/services/accessibility';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { createAppPreferences } from '../settings/preferences-store';
import {
  ACCESSIBILITY_POLICY,
  ACCESSIBILITY_SETTINGS_KEY,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  fitnessConfigFor,
  missionForProfile,
  MOBILITY_PROFILE_OPTIONS,
  normaliseAccessibilitySettings,
  type AccessibilitySettings,
} from './accessibility-settings';

const root = join(__dirname, '..', '..', '..');
const settings = (s: Partial<AccessibilitySettings> = {}): AccessibilitySettings => ({ ...DEFAULT_ACCESSIBILITY_SETTINGS, ...s });

/** Completes any activity the way a person would (paced taps, full holds, numbers in order, or waiting). */
function complete(config: FitnessMissionConfig): FitnessMissionResult {
  let s: FitnessSession = startFitness(createFitnessSession(config, 42), 0);
  let t = s.countdownMs;
  for (let guard = 0; fitnessPhase(s, t) !== 'done' && guard < 1000; guard++) {
    if (s.kind === 'reps') s = recordRep(s, (t += 2000)).session;
    else if (s.kind === 'holds') s = recordHold(s, (t += 500), (t += s.minHoldMs + 100)).session;
    else if (s.kind === 'sequence') s = tapNumber(s, s.nextNumber, (t += 300)).session;
    else s = tickFitness(s, (t += 1000));
  }
  return fitnessResult(s)!;
}

describe('Mobility Profile', () => {
  it('three profiles, each offered with plain descriptions (ready for onboarding too)', () => {
    expect(MOBILITY_PROFILE_OPTIONS.map((o) => o.value)).toEqual(['standard', 'reduced_mobility', 'non_physical']);
    for (const o of MOBILITY_PROFILE_OPTIONS) expect(o.description).not.toMatch(/safe for|medical|therapy|treat/i);
  });

  it('is saved on the phone and survives a restart', async () => {
    const store = createMemorySettingsStore();
    await createAppPreferences(store).accessibility.update({ mobilityProfile: 'non_physical' });
    expect((await createAppPreferences(store).accessibility.get()).mobilityProfile).toBe('non_physical');
  });

  it('loads safely: unknown values fall back to Standard / Normal; the earlier development key still loads', () => {
    expect(normaliseAccessibilitySettings({ mobilityProfile: 'flying', missionPacing: 'slow' })).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(normaliseAccessibilitySettings({ fitnessAdaptation: 'reduced_mobility' }).mobilityProfile).toBe('reduced_mobility');
    expect(normaliseAccessibilitySettings(undefined)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(ACCESSIBILITY_SETTINGS_KEY).toBe('accessibility.settings');
  });
});

describe('each profile has its own catalogue', () => {
  it('Standard, Reduced mobility and Non-physical catalogues', () => {
    expect(catalogueFor('standard').map((e) => EXERCISES[e].label)).toEqual(['Push-ups', 'Squats', 'Jumping jacks', 'Stretch', 'Walk in place']);
    expect(catalogueFor('reduced_mobility').map((e) => EXERCISES[e].label)).toEqual([
      'Wall push',
      'Chair sit-to-stand',
      'Step-out movement',
      'Seated stretch',
      'Seated marching',
    ]);
    expect(catalogueFor('non_physical').map((e) => EXERCISES[e].label)).toEqual([
      'Controlled breathing',
      'Number focus',
      'Hold and release',
      'Grounding',
    ]);
  });

  it('catalogues are presented on their own: no activity is described as a version of another', () => {
    for (const profile of ['reduced_mobility', 'non_physical'] as const) {
      for (const e of catalogueFor(profile)) {
        const { label, howTo } = EXERCISES[e];
        expect(`${label} ${howTo}`).not.toMatch(/version of|instead of|alternative to|push-ups|squats|jumping jacks/i);
      }
    }
  });

  it('non-physical activities are never presented as exercise', () => {
    for (const e of catalogueFor('non_physical')) {
      expect(EXERCISES[e].howTo).not.toMatch(/exercise|workout|reps/i);
    }
    const view = readFileSync(join(root, 'src/features/missions/fitness/fitness-mission-view.tsx'), 'utf8');
    expect(view).toContain("physical ? 'Fitness' : 'Wake-up activity'");
  });

  it('an alarm saved under another profile runs (and is described as) an activity from the current catalogue', () => {
    const alarm: AlarmMission = { type: 'fitness', exercise: 'pushups', difficulty: 'medium' };
    for (const profile of MOBILITY_PROFILES) {
      const shown = missionForProfile(alarm, profile);
      expect(shown.type === 'fitness' && catalogueFor(profile).includes(shown.exercise)).toBe(true);
      const run = fitnessConfigFor(alarm.type === 'fitness' ? alarm : (null as never), settings({ mobilityProfile: profile }));
      expect(catalogueFor(profile)).toContain(run.exercise);
    }
    expect(describeMission(missionForProfile(alarm, 'reduced_mobility'))).toBe('Wall push · Medium · 15 reps');
    expect(describeMission(missionForProfile(alarm, 'non_physical'))).toBe('Controlled breathing · Medium · 2 min');
    // Activities already in the current catalogue run as saved; other missions are untouched.
    expect(activityForProfile('grounding', 'non_physical')).toBe('grounding');
    expect(missionForProfile({ type: 'math', difficulty: 'easy', questionCount: 3 }, 'non_physical').type).toBe('math');
  });
});

describe('non-physical activities', () => {
  const at = (exercise: FitnessMissionConfig['exercise']) => createFitnessSession({ exercise, difficulty: 'easy' }, 7);

  it('controlled breathing and grounding: timed, with guided cues', () => {
    const s = startFitness(at('controlled_breathing'), 0);
    expect(currentCue(s, FITNESS_COUNTDOWN_MS)).toMatch(/Breathe in/);
    expect(currentCue(s, FITNESS_COUNTDOWN_MS + 5000)).toMatch(/Breathe out/);
    expect(complete({ exercise: 'grounding', difficulty: 'easy' })).toMatchObject({ kind: 'timed', achieved: 60, verification: 'self_reported' });
  });

  it('hold and release: a hold only counts when held long enough', () => {
    const s = startFitness(at('hold_release'), 0);
    const a = FITNESS_COUNTDOWN_MS;
    expect(recordHold(s, a, a + 1000).outcome).toBe('too_short');
    expect(recordHold(s, 0, 4000).outcome).toBe('not_active'); // pressed during the countdown
    expect(recordHold(s, a, a + 3000).session.reps).toBe(1);
    expect(complete({ exercise: 'hold_release', difficulty: 'medium' })).toMatchObject({ kind: 'holds', target: 8, achieved: 8 });
  });

  it('number focus: tap 1–9 in order; wrong taps don’t count; each round reshuffles; the task is checked', () => {
    let s = startFitness(at('number_focus'), 0);
    const a = FITNESS_COUNTDOWN_MS;
    expect([...s.grid].sort((x, y) => x - y)).toEqual(Array.from({ length: SEQUENCE_LENGTH }, (_, i) => i + 1));
    expect(tapNumber(s, 2, a).outcome).toBe('wrong');
    for (let n = 1; n <= SEQUENCE_LENGTH; n++) s = tapNumber(s, n, a + n).session;
    expect(fitnessResult(s)).toMatchObject({ kind: 'sequence', achieved: 1, verification: 'task_checked' });
    const two = complete({ exercise: 'number_focus', difficulty: 'medium' });
    expect(two).toMatchObject({ target: 2, achieved: 2 });
  });
});

function completedMorning(mission: AlarmMission, result: FitnessMissionResult, mode: 'reward' | 'challenge') {
  const step = (r: TransitionResult) => {
    if (!r.ok) throw new Error(r.error);
    return r.occurrence;
  };
  const alarm = { ...createAlarmDraft({ mission, isPrimary: true, completionMode: mode }), id: 'a', createdAt: 0, updatedAt: 0 };
  const created = createOccurrence({ id: `o-${result.exercise}`, alarm, scheduledAt: 1_000, source: 'simulated', now: 0 });
  return step(completeMission(step(startMission(step(markAlarmFired(created, 1_000)), 2_000)), result, 60_000));
}

describe('the Mobility Profile never reduces XP', () => {
  it('one mission from each profile earns the same XP at the same difficulty, including the Challenge bonus', () => {
    const alarm: AlarmMission = { type: 'fitness', exercise: 'squats', difficulty: 'medium' };
    for (const mode of ['reward', 'challenge'] as const) {
      const xp = MOBILITY_PROFILES.map((profile: MobilityProfile) => {
        const config = fitnessConfigFor(alarm.type === 'fitness' ? alarm : (null as never), settings({ mobilityProfile: profile }));
        const result = complete(config);
        expect(catalogueFor(profile)).toContain(result.exercise);
        return xpForMorning(completedMorning(alarm, result, mode), PROGRESSION_POLICY).map((e) => [e.category, e.amount]);
      });
      expect(xp[1]).toEqual(xp[0]);
      expect(xp[2]).toEqual(xp[0]);
      expect(xp[0][0]).toEqual(['fitness', 12]);
    }
  });
});

describe('mission pacing', () => {
  it('Extended gives longer to get ready; targets and the anti-tap rule are unchanged', () => {
    const alarm = { exercise: 'pushups', difficulty: 'medium' } as const;
    const normal = createFitnessSession(fitnessConfigFor(alarm, settings()));
    const extended = createFitnessSession(fitnessConfigFor(alarm, settings({ missionPacing: 'extended' })));
    expect(normal.countdownMs).toBe(ACCESSIBILITY_POLICY.fitnessCountdownMs.normal);
    expect(extended.countdownMs).toBe(ACCESSIBILITY_POLICY.fitnessCountdownMs.extended);
    expect([extended.target, extended.minRepIntervalMs]).toEqual([normal.target, normal.minRepIntervalMs]);
    const started = startFitness(extended, 0);
    expect(countdownLeft(started, 0)).toBe(10);
    expect(fitnessPhase(started, 9_000)).toBe('countdown');
    expect(fitnessPhase(started, 10_000)).toBe('active');
  });
});

describe('motion and text', () => {
  it('Reduce Motion: screens fade instead of sliding', () => {
    expect(screenAnimation(true)).toBe('fade');
    expect(screenAnimation(false)).toBe('default');
  });

  it('large text switches side-by-side layouts to stacked ones', () => {
    expect(isLargeText(1)).toBe(false);
    expect(isLargeText(1.2)).toBe(false);
    expect(isLargeText(1.35)).toBe(true);
    expect(isLargeText(3.1)).toBe(true);
  });

  it('no separate Terbit switch for Reduce Motion or text size: they follow the iPhone', () => {
    expect(Object.keys(DEFAULT_ACCESSIBILITY_SETTINGS).sort()).toEqual(['missionPacing', 'mobilityProfile']);
  });
});
