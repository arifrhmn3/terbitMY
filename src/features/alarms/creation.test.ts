import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_FAITH_SETTINGS, type FaithSettings } from '@/features/faith/types';
import { catalogueFor } from '@/features/missions/fitness/exercises';
import { MOBILITY_PROFILES, type MobilityProfile } from '@/features/missions/fitness/types';
import { createNotImplementedAlarmService } from '@/services/alarm-scheduler/not-implemented';

import { createAlarmDraft, validateAlarm, type AlarmMission } from './alarm';
import { ALARM_DEFAULTS } from './alarm-defaults';
import { createMemoryAlarmRepository } from './alarm-repository';
import { createAlarmStore } from './alarm-store';
import {
  categoriesFor,
  CREATION_STEPS,
  draftFromCreation,
  findChoice,
  missionChoices,
  missionControls,
  practiceParams,
  type CreationContext,
} from './creation';

const root = join(__dirname, '..', '..', '..');
const app = (...p: string[]) => join(root, 'src', 'app', '(tabs)', ...p);
const faith = (s: Partial<FaithSettings> = {}): FaithSettings => ({ ...DEFAULT_FAITH_SETTINGS, ...s });
const ctx = (mobilityProfile: MobilityProfile = 'standard', f: Partial<FaithSettings> = {}): CreationContext => ({
  mobilityProfile,
  faith: faith(f),
});

describe('step 1: category', () => {
  it('asks what to be accountable for: Education, Fitness, Faith (in that order, before any time)', () => {
    expect(categoriesFor(ctx()).map((c) => c.title)).toEqual(['Education', 'Fitness', 'Faith']);
    expect(CREATION_STEPS).toEqual(['category', 'mission', 'time']);
  });

  it('Fitness follows the Mobility Profile: “Wake-up activity” for Non-physical, with its own activities', () => {
    const nonPhysical = categoriesFor(ctx('non_physical')).find((c) => c.id === 'fitness')!;
    expect(nonPhysical.title).toBe('Wake-up activity');
    expect(nonPhysical.subtitle).toMatch(/Controlled breathing/);
    expect(categoriesFor(ctx('reduced_mobility')).find((c) => c.id === 'fitness')!.subtitle).toMatch(/^Wall push/);
  });
});

describe('step 2: mission', () => {
  it('Education: Maths and the four quiz topics', () => {
    expect(missionChoices('education', ctx()).map((c) => c.title)).toEqual(['Maths', 'General Knowledge', 'Geography', 'Vocabulary', 'Logic']);
  });

  it('Fitness: only the user’s Mobility Profile catalogue', () => {
    for (const profile of MOBILITY_PROFILES) {
      const choices = missionChoices('fitness', ctx(profile));
      expect(choices.map((c) => c.id)).toEqual([...catalogueFor(profile)]);
      expect(choices.every((c) => c.mission.type === 'fitness')).toBe(true);
    }
    expect(missionChoices('fitness', ctx('reduced_mobility')).map((c) => c.title)).toEqual([
      'Wall push',
      'Chair sit-to-stand',
      'Step-out movement',
      'Seated stretch',
      'Seated marching',
    ]);
  });

  it('Faith: follows the primary faith and Explore, without asking again', () => {
    expect(missionChoices('faith', ctx()).map((c) => c.id)).toEqual(['reflection']);
    expect(missionChoices('faith', ctx('standard', { primary: 'non_religious' })).map((c) => c.id)).toEqual(['reflection']);
    const islam = missionChoices('faith', ctx('standard', { primary: 'islam' }));
    expect(islam.map((c) => c.title)).toEqual(['Recitation', 'Reflection / Meditation', 'Recitation + Reflection']);
    expect(islam.map((c) => c.mission)).toEqual([
      { type: 'recitation', tradition: 'islam' },
      { type: 'reflection', difficulty: 'easy' },
      { type: 'recitation_reflection', tradition: 'islam', difficulty: 'easy' },
    ]);
    const exploring = missionChoices('faith', ctx('standard', { primary: 'prefer_not_to_say', exploreOtherTraditions: true }));
    expect(exploring.map((c) => c.id)).toEqual(['reflection', 'recitation', 'recitation_reflection']);
  });

  it('a choice can be found again by its id (route params)', () => {
    expect(findChoice('education', 'quiz-vocabulary', ctx())?.mission).toEqual({
      type: 'quiz',
      category: 'vocabulary',
      difficulty: 'easy',
      questionCount: 3,
    });
    expect(findChoice('fitness', 'pushups', ctx('non_physical'))).toBeNull();
  });
});

describe('step 3: Save Alarm with the central defaults', () => {
  const maths = missionChoices('education', ctx())[0].mission;

  it('creates a complete, valid alarm: chosen mission and time, everything else from ALARM_DEFAULTS', () => {
    const draft = draftFromCreation({ mission: maths, hour: 6, minute: 45 });
    expect(validateAlarm(draft)).toEqual([]);
    expect(draft).toEqual({
      hour: 6,
      minute: 45,
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
      label: '',
      mission: { type: 'math', difficulty: 'easy', questionCount: 3 },
      snooze: { enabled: true, minutes: 10, maxSnoozes: 3 },
      isPrimary: false,
      completionMode: 'reward',
      gentleReminderMinutes: 10,
      soundId: 'system-default',
    });
  });

  it('Quick Save repeats Monday–Friday by default', () => {
    expect(draftFromCreation({ mission: maths, hour: 7, minute: 0 }).weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(ALARM_DEFAULTS.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('an alarm is never the Main Wake-Up just because it is the first one', () => {
    expect(draftFromCreation({ mission: maths, hour: 7, minute: 0 }).isPrimary).toBe(false);
    expect(createAlarmDraft().isPrimary).toBe(false);
    expect(Object.keys(ALARM_DEFAULTS)).not.toContain('mainWakeUp');
  });

  it('every mission choice saves as a valid alarm, for every profile and faith setting', () => {
    for (const profile of MOBILITY_PROFILES) {
      for (const f of [{}, { primary: 'hinduism' as const }]) {
        for (const category of ['education', 'fitness', 'faith'] as const) {
          for (const c of missionChoices(category, ctx(profile, f))) {
            expect(validateAlarm(draftFromCreation({ mission: c.mission, hour: 5, minute: 0 }))).toEqual([]);
          }
        }
      }
    }
  });
});

describe('central default policy', () => {
  it('createAlarmDraft() is exactly ALARM_DEFAULTS', () => {
    const d = createAlarmDraft();
    expect(d).toMatchObject({
      hour: ALARM_DEFAULTS.hour,
      minute: ALARM_DEFAULTS.minute,
      weekdays: ALARM_DEFAULTS.weekdays,
      completionMode: ALARM_DEFAULTS.completionMode,
      gentleReminderMinutes: ALARM_DEFAULTS.gentleReminderMinutes,
      snooze: ALARM_DEFAULTS.snooze,
      soundId: ALARM_DEFAULTS.soundId,
      mission: { type: 'math', difficulty: ALARM_DEFAULTS.difficulty, questionCount: ALARM_DEFAULTS.questionCount },
    });
  });

  it('screens don’t hard-code defaults: they read the policy', () => {
    for (const file of [app('alarms', 'create', 'time.tsx'), join(root, 'src', 'features', 'alarms', 'creation.ts')]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/completionMode: '|difficulty: 'easy'|questionCount: 3|weekdays: \[/);
    }
  });
});

describe('Customise: only the settings that apply', () => {
  const controls = (m: AlarmMission) => missionControls(m);
  it('question count only for Maths and Quiz; Reflection length only with a Reflection; tradition only with Recitation', () => {
    expect(controls({ type: 'math', difficulty: 'easy', questionCount: 3 })).toEqual(['difficulty', 'questionCount']);
    expect(controls({ type: 'quiz', category: 'logic', difficulty: 'easy', questionCount: 3 })).toEqual(['topic', 'difficulty', 'questionCount']);
    expect(controls({ type: 'fitness', exercise: 'grounding', difficulty: 'easy' })).toEqual(['exercise', 'difficulty']);
    expect(controls({ type: 'recitation', tradition: 'islam' })).toEqual(['tradition']);
    expect(controls({ type: 'reflection', difficulty: 'easy' })).toEqual(['reflectionLength']);
    expect(controls({ type: 'recitation_reflection', tradition: 'islam', difficulty: 'easy' })).toEqual(['tradition', 'reflectionLength']);
    expect(controls({ type: 'none' })).toEqual([]);
  });

  it('the editor uses these rules and shows the general options (mode, repeat, label, Main Wake-Up)', () => {
    const editor = readFileSync(join(root, 'src', 'features', 'alarms', 'components', 'alarm-editor.tsx'), 'utf8');
    expect(editor).toContain('const controls = missionControls(mission);');
    for (const text of ['Accountability mode', 'title="Repeat"', 'Main wake-up alarm', 'Label (optional)']) expect(editor).toContain(text);
  });

  it('practice links carry the mission’s settings', () => {
    expect(practiceParams({ type: 'quiz', category: 'logic', difficulty: 'hard', questionCount: 5 })).toMatchObject({
      mission: 'quiz',
      category: 'logic',
      difficulty: 'hard',
      count: '5',
    });
    expect(practiceParams({ type: 'recitation', tradition: 'buddhism' })).toMatchObject({ mission: 'recitation', tradition: 'buddhism' });
  });
});

describe('saved alarms can still be managed', () => {
  it('a Quick-Saved alarm can be found, edited, turned off and deleted', async () => {
    const repository = createMemoryAlarmRepository();
    const store = createAlarmStore(async () => repository, createNotImplementedAlarmService());
    await store.load();
    const { alarm } = await store.save(draftFromCreation({ mission: { type: 'math', difficulty: 'easy', questionCount: 3 }, hour: 6, minute: 0 }));
    expect(await store.find(alarm.id)).toMatchObject({ isPrimary: false, completionMode: 'reward' });
    await store.save({ ...alarm, completionMode: 'gentle', weekdays: [1, 2, 3] }, alarm.id);
    await store.setEnabled(alarm.id, false);
    expect(await store.find(alarm.id)).toMatchObject({ completionMode: 'gentle', weekdays: [1, 2, 3], enabled: false });
    await store.remove(alarm.id);
    expect(await repository.list()).toEqual([]);
  });

  it('Manage alarms and the editor are reachable from Alarms and Today', () => {
    for (const route of [
      ['alarms', 'index.tsx'],
      ['alarms', 'create', '[category].tsx'],
      ['alarms', 'create', 'time.tsx'],
      ['alarms', 'manage.tsx'],
      ['alarms', 'missions.tsx'],
      ['alarms', '[id].tsx'],
      ['today', 'alarm', '[id].tsx'],
    ]) {
      expect(existsSync(app(...route))).toBe(true);
    }
    expect(readFileSync(app('alarms', 'index.tsx'), 'utf8')).toContain('href="/alarms/manage"');
  });
});

describe('Recent mornings moved to Progress', () => {
  it('lives under Progress and no longer under Alarms', () => {
    expect(existsSync(app('progress', 'history.tsx'))).toBe(true);
    expect(existsSync(app('alarms', 'history.tsx'))).toBe(false);
    expect(readFileSync(app('progress', 'index.tsx'), 'utf8')).toContain('href="/progress/history"');
  });
});
