import { describe, expect, it, jest } from '@jest/globals';

import { createAlarmDraft, type Alarm } from '@/features/alarms/alarm';
import { unavailableScreenTime, type ScreenTimeAuthorization, type ScreenTimeService } from '@/services/screen-time';
import { migrate } from '@/services/storage/migrations';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import * as labels from './labels';
import {
  AUTHORIZATION_INFO,
  describeRestriction,
  describeSelection,
  formatDuration,
  NOTIFICATION_INFO,
  sleepFocusGuidance,
  tonightRow,
  tonightTitle,
  weeklyNightSummary,
} from './labels';
import { createMemoryNightRoutineRepository, createSqliteNightRoutineRepository, routineFromRow } from './night-repository';
import {
  createNightRoutineDraft,
  NIGHT_ROUTINE_DEFAULTS,
  nightRoutineFromAnswers,
  restrictionStartTime,
  restrictsApps,
  validateNightRoutine,
} from './night-routine';
import { createNightStore, REMINDER_DAYS, windDownReminderId } from './night-store';

/** Wednesday 14 Oct 2026, local time. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const SELECTION = { token: 'opaque-apple-token', applications: 2, categories: 1, webDomains: 0 };
const main: Alarm = { ...createAlarmDraft({ hour: 6, minute: 30, weekdays: [1, 2, 3, 4, 5], isPrimary: true }), id: 'main', createdAt: 0, updatedAt: 0 };

describe('Night Routine model', () => {
  it('central defaults: every night, wind-down and restrictions 22:30, bedtime 23:00, ends at the Main Wake-Up (fallback 07:00)', () => {
    expect(createNightRoutineDraft()).toEqual(NIGHT_ROUTINE_DEFAULTS);
    expect(NIGHT_ROUTINE_DEFAULTS).toMatchObject({
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      windDown: { hour: 22, minute: 30 },
      bedtime: { hour: 23, minute: 0 },
      endRule: 'main_wake_up',
      fallbackEnd: { hour: 7, minute: 0 },
      activity: 'none',
    });
    expect(validateNightRoutine(createNightRoutineDraft())).toEqual([]);
    expect(restrictionStartTime(NIGHT_ROUTINE_DEFAULTS)).toEqual({ hour: 22, minute: 30 });
  });

  it('restrictions start at wind-down: one source of truth, no separate setting', () => {
    expect(NIGHT_ROUTINE_DEFAULTS).not.toHaveProperty('restrictionStart');
    const draft = createNightRoutineDraft({ windDown: { hour: 21, minute: 45 } });
    expect(restrictionStartTime(draft)).toEqual({ hour: 21, minute: 45 });
    // Changing wind-down changes when restrictions start; bedtime stays later.
    const later = { ...draft, windDown: { hour: 22, minute: 15 } };
    expect(restrictionStartTime(later)).toEqual({ hour: 22, minute: 15 });
    expect(later.bedtime).toEqual({ hour: 23, minute: 0 });
    expect(validateNightRoutine(later)).toEqual([]);
  });

  it('validation in plain words', () => {
    expect(validateNightRoutine(createNightRoutineDraft({ windDown: { hour: 23, minute: 30 } }))).toContain('Wind-down must start before bedtime');
    expect(validateNightRoutine(createNightRoutineDraft({ windDown: { hour: 6, minute: 50 }, bedtime: { hour: 6, minute: 55 } }))).toContain(
      'The morning end time must be at least 15 minutes after wind-down',
    );
    expect(validateNightRoutine(createNightRoutineDraft({ weekdays: [] }))).toContain('Choose at least one night');
    expect(validateNightRoutine(createNightRoutineDraft({ fallbackEnd: { hour: 13, minute: 0 } }))).toContain('The morning end time must be before noon');
    // A bedtime after midnight is fine (still that night).
    expect(validateNightRoutine(createNightRoutineDraft({ windDown: { hour: 23, minute: 30 }, bedtime: { hour: 0, minute: 30 } }))).toEqual([]);
  });

  it('apps are restricted only when turned on AND something was chosen in Apple’s picker', () => {
    expect(restrictsApps(createNightRoutineDraft())).toBe(false);
    expect(restrictsApps(createNightRoutineDraft({ selection: SELECTION }))).toBe(true);
    expect(restrictsApps(createNightRoutineDraft({ selection: SELECTION, restrictApps: false }))).toBe(false);
  });

  it('ready for onboarding: answers become a routine without any screen', () => {
    expect(nightRoutineFromAnswers({ bedtime: { hour: 0, minute: 15 }, windDownMinutes: 45, activity: 'reflection', nights: [0, 1, 2, 3, 4] })).toMatchObject({
      bedtime: { hour: 0, minute: 15 },
      windDown: { hour: 23, minute: 30 },
      activity: 'reflection',
      weekdays: [0, 1, 2, 3, 4],
    });
    expect(restrictionStartTime(nightRoutineFromAnswers({ bedtime: { hour: 0, minute: 15 }, windDownMinutes: 45 }))).toEqual({ hour: 23, minute: 30 });
  });
});

describe('persistence (SQLite on the phone; migration 12)', () => {
  it('saves, updates and deletes with the real migrations', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const repo = createSqliteNightRoutineRepository(db);
    const routine = { ...createNightRoutineDraft({ selection: SELECTION, weekdays: [5, 6] }), id: 'night', createdAt: 1, updatedAt: 2 };
    await repo.save(routine);
    expect(await repo.get('night')).toEqual(routine);
    await repo.save({ ...routine, bedtime: { hour: 23, minute: 30 }, updatedAt: 3 });
    expect((await repo.get('night'))?.bedtime).toEqual({ hour: 23, minute: 30 });
    await repo.remove('night');
    expect(await repo.get('night')).toBeNull();
  });

  it('reads damaged or older data safely (defaults fill the gaps)', () => {
    expect(routineFromRow({ id: 'night', config: '{not json', created_at: 1, updated_at: 1 })).toMatchObject({ ...NIGHT_ROUTINE_DEFAULTS, id: 'night' });
    const partial = routineFromRow({ id: 'night', config: JSON.stringify({ bedtime: { hour: 22, minute: 0 }, weekdays: [6, 6, 9, 1], activity: 'disco' }), created_at: 1, updated_at: 1 });
    expect(partial).toMatchObject({ bedtime: { hour: 22, minute: 0 }, weekdays: [1, 6], activity: 'none', windDown: NIGHT_ROUTINE_DEFAULTS.windDown });
  });

  it('a routine saved with the old separate restriction start keeps everything else and now restricts from wind-down', async () => {
    const old = { windDown: { hour: 22, minute: 0 }, bedtime: { hour: 23, minute: 0 }, restrictionStart: { hour: 23, minute: 0 }, selection: SELECTION, weekdays: [1, 2] };
    const routine = routineFromRow({ id: 'night', config: JSON.stringify(old), created_at: 1, updated_at: 1 });
    expect(routine).not.toHaveProperty('restrictionStart');
    expect(routine).toMatchObject({ windDown: old.windDown, bedtime: old.bedtime, selection: SELECTION, weekdays: [1, 2] });
    expect(restrictionStartTime(routine)).toEqual({ hour: 22, minute: 0 });
    // Saving it again drops the old key for good.
    const repo = createMemoryNightRoutineRepository();
    await repo.save(routine);
    expect(await repo.get('night')).toEqual(routine);
  });
});

function fakeScreenTime(authorization: ScreenTimeAuthorization) {
  const service: ScreenTimeService & { applied: unknown[]; ended: number[] } = {
    applied: [],
    ended: [],
    getAuthorization: jest.fn(async () => authorization),
    requestAuthorization: jest.fn(async () => ({ status: 'approved' as const })),
    pickApps: jest.fn(async () => SELECTION),
    async apply(plan) {
      service.applied.push(plan);
      return { scheduled: plan.nights.length, errors: [] };
    },
    clear: jest.fn(async () => {}),
    async endTonight(until) {
      service.ended.push(until);
    },
    getState: jest.fn(async () => ({ shieldActive: false, overriddenUntil: service.ended.at(-1) ?? null, monitoring: [] })),
  };
  return service;
}

function setup(authorization: ScreenTimeAuthorization, start = at(14, 12)) {
  const clock = { time: start };
  const screenTime = fakeScreenTime(authorization);
  const reminders = { scheduled: new Map<string, number>(), schedule: jest.fn(async (r: { id: string; fireAt: number }) => void reminders.scheduled.set(r.id, r.fireAt)), cancel: jest.fn(async (id: string) => void reminders.scheduled.delete(id)) };
  const store = createNightStore({ getRepository: async () => repository, screenTime, reminders, alarms: () => [main], now: () => clock.time });
  const repository = createMemoryNightRoutineRepository();
  return { clock, screenTime, reminders, store, repository };
}

describe('Night Routine store: create, update, delete, and the phone’s schedule', () => {
  it('create → saved on the phone, native schedule applied (authorised), wind-down reminders for the coming week', async () => {
    const { store, screenTime, reminders, repository } = setup('approved');
    await store.save(createNightRoutineDraft({ selection: SELECTION }));
    expect(await repository.get('night')).toMatchObject({ selection: SELECTION });
    expect(screenTime.applied).toHaveLength(1);
    expect(reminders.scheduled.size).toBe(REMINDER_DAYS);
    expect(reminders.scheduled.get(windDownReminderId(at(14, 12)))).toBe(at(14, 22, 30));
  });

  it('update → re-applied; delete → schedule cleared and reminders cancelled (alarms untouched)', async () => {
    const { store, screenTime, reminders } = setup('approved');
    await store.save(createNightRoutineDraft({ selection: SELECTION }));
    await store.save(createNightRoutineDraft({ selection: SELECTION, windDown: { hour: 22, minute: 0 }, bedtime: { hour: 23, minute: 30 } }));
    expect(screenTime.applied).toHaveLength(2);
    // The changed wind-down moves the native start with it.
    const last = screenTime.applied.at(-1) as { nights: { id: string; start: { hour: number; minute: number } }[] };
    expect(last.nights.find((n) => n.id === 'terbit.night.3')?.start).toMatchObject({ hour: 22, minute: 0 });
    await store.remove();
    expect(store.getState().routine).toBeNull();
    expect(screenTime.clear).toHaveBeenCalled();
    expect(reminders.scheduled.size).toBe(0);
  });

  it('a build without Screen Time (switch off): the routine and reminders still work; nothing native is attempted', async () => {
    const { store, screenTime, reminders } = setup('not_configured');
    await store.save(createNightRoutineDraft({ selection: SELECTION }));
    expect(screenTime.applied).toEqual([]);
    expect(store.restriction()).toEqual({ kind: 'unavailable' });
    expect(reminders.scheduled.size).toBe(REMINDER_DAYS);
  });

  it('no wind-down reminders when turned off or the routine is off', async () => {
    const { store, reminders } = setup('approved');
    await store.save(createNightRoutineDraft({ windDownReminder: false }));
    expect(reminders.scheduled.size).toBe(0);
    await store.save(createNightRoutineDraft({ enabled: false }));
    expect(reminders.scheduled.size).toBe(0);
  });

  it('invalid routines are not saved', async () => {
    const { store } = setup('approved');
    await expect(store.save(createNightRoutineDraft({ weekdays: [] }))).rejects.toThrow('Choose at least one night');
  });

  it('ending tonight early: only while active (from wind-down); until the morning; routine kept; restrictions return the next night', async () => {
    const { store, screenTime, clock, repository } = setup('approved', at(14, 20));
    await store.save(createNightRoutineDraft({ selection: SELECTION }));
    expect(await store.endTonight()).toBe(false); // not active yet
    clock.time = at(14, 22, 40); // winding down, before bedtime: already active
    expect(store.restriction()).toMatchObject({ kind: 'active' });
    const appliedBefore = screenTime.applied.length;
    expect(await store.endTonight()).toBe(true);
    expect(screenTime.ended).toEqual([at(15, 6, 30)]);
    expect(store.restriction()).toMatchObject({ kind: 'overridden' });
    // The routine and its schedule are untouched.
    expect(await repository.get('night')).toMatchObject({ selection: SELECTION, enabled: true });
    expect(screenTime.applied).toHaveLength(appliedBefore);
    expect(screenTime.clear).not.toHaveBeenCalled();
    clock.time = at(15, 22, 30); // next wind-down
    expect(store.restriction()).toMatchObject({ kind: 'active' });
  });

  it('the wind-down reminder says apps are restricted only when Screen Time can actually restrict them', async () => {
    const bodies = async (authorization: ScreenTimeAuthorization) => {
      const { store, reminders } = setup(authorization);
      await store.save(createNightRoutineDraft({ selection: SELECTION }));
      return (reminders.schedule.mock.calls as unknown as [{ body: string }][]).map(([r]) => r.body);
    };
    expect(await bodies('approved')).toContain('Bedtime is 23:00. Your chosen apps are restricted from now.');
    expect((await bodies('not_configured')).every((b) => b === 'Bedtime is 23:00.')).toBe(true);
  });

  it('Screen Time is requested only when asked, and an approval schedules straight away', async () => {
    const { store, screenTime } = setup('not_determined');
    await store.save(createNightRoutineDraft({ selection: SELECTION }));
    expect(screenTime.requestAuthorization).not.toHaveBeenCalled();
    (screenTime.getAuthorization as jest.Mock<() => Promise<ScreenTimeAuthorization>>).mockResolvedValue('approved');
    await store.requestAuthorization();
    expect(screenTime.applied).toHaveLength(1);
  });
});

describe('authorization states, explained', () => {
  it('every state has a label and recovery guidance; a build without Screen Time says so plainly', () => {
    for (const status of ['not_configured', 'unavailable', 'not_determined', 'approved', 'denied'] as const) {
      expect(AUTHORIZATION_INFO[status].label.length).toBeGreaterThan(0);
      expect(AUTHORIZATION_INFO[status].guidance.length).toBeGreaterThan(0);
    }
    expect(AUTHORIZATION_INFO.not_configured.label).toBe('Not in this build');
    expect(AUTHORIZATION_INFO.not_configured.guidance).not.toMatch(/approv/i);
    expect(AUTHORIZATION_INFO.denied.guidance).toMatch(/iPhone Settings → Screen Time/);
    // The app's minimum iOS already supports Screen Time: never a misleading iOS-version warning.
    expect(JSON.stringify(AUTHORIZATION_INFO)).not.toMatch(/iOS \d/);
  });

  it('where Screen Time isn’t compiled in (Android, web, Expo Go, tests): unavailable, and nothing happens', async () => {
    expect(await unavailableScreenTime.getAuthorization()).toBe('unavailable');
    expect(await unavailableScreenTime.pickApps(null)).toBeNull();
  });
});

describe('words', () => {
  it('app choices are counted, never named (Terbit MY can’t see them)', () => {
    expect(describeSelection(SELECTION)).toBe('2 apps, 1 category');
    expect(describeSelection({ token: null, applications: 0, categories: 0, webDomains: 0 })).toBe('None chosen');
  });

  it('tonight rows: restrictions begin on the wind-down row and end on the Main Wake-Up row', () => {
    expect(tonightRow({ kind: 'wind_down', at: at(14, 22, 30), restrictsApps: true })).toEqual({ time: '22:30', title: 'Wind-down begins · Apps restricted' });
    expect(tonightRow({ kind: 'wind_down', at: at(14, 22, 30), restrictsApps: false })).toEqual({ time: '22:30', title: 'Wind-down begins' });
    expect(tonightRow({ kind: 'bedtime', at: at(14, 23) })).toEqual({ time: '23:00', title: 'Bedtime' });
    expect(tonightRow({ kind: 'main_wake_up', at: at(15, 6, 30), alarmId: 'main', endsRestrictions: true })).toEqual({
      time: '06:30',
      title: 'Main Wake-Up tomorrow · Restrictions end',
    });
    expect(tonightRow({ kind: 'restrictions_end', at: at(15, 7) })).toEqual({ time: '07:00', title: 'Restrictions end' });
    expect(tonightRow({ kind: 'no_main_wake_up' }).title).toMatch(/No Main Wake-Up tomorrow/);
  });

  it('restriction states and the Tonight heading say restrictions begin at wind-down', () => {
    expect(describeRestriction({ kind: 'scheduled', startsAt: at(14, 22, 30), endsAt: at(15, 6, 30) })).toBe('Apps restricted from wind-down (22:30) until 06:30');
    expect(describeRestriction({ kind: 'active', endsAt: at(15, 6, 30) })).toBe('Apps restricted until 06:30');
    expect(describeRestriction({ kind: 'inactive' })).toBeNull();
    expect(tonightTitle({ kind: 'active', endsAt: 0 }, 'wind_down')).toBe('Tonight · Wind-down active');
    expect(tonightTitle({ kind: 'active', endsAt: 0 }, 'night')).toBe('Tonight · Bedtime');
    expect(tonightTitle({ kind: 'overridden', endsAt: 0 }, 'night')).toBe('Tonight');
    expect(tonightTitle({ kind: 'scheduled', startsAt: 0, endsAt: 0 }, 'evening')).toBe('Tonight');
  });

  it('weekly line: apps restricted from wind-down, bedtime, end', () => {
    expect(weeklyNightSummary({ bedtimeAt: at(14, 23), restrictions: { from: at(14, 22, 30), until: at(15, 6, 30) } })).toBe(
      'Apps restricted from wind-down · Bedtime 23:00 · Ends 06:30',
    );
    expect(weeklyNightSummary({ bedtimeAt: at(14, 23), restrictions: null })).toBe('Bedtime 23:00');
  });

  it('never claims to block or silence other apps’ notifications (Apple gives no API for that)', () => {
    const everyString = JSON.stringify(Object.values(labels).filter((v) => typeof v !== 'function'));
    expect(everyString).not.toMatch(/notifications?\s+(are\s+)?(blocked|silenced|muted|off)/i);
    expect(NOTIFICATION_INFO.guidance).toMatch(/can’t turn off other apps’ notifications or turn on a Focus/);
  });

  it('Sleep Focus guidance: optional, same time as wind-down, and never claims Terbit MY turns it on', () => {
    const text = sleepFocusGuidance({ hour: 22, minute: 30 });
    expect(text).toBe(
      'Optional: for a fully quiet wind-down, set up Sleep Focus to start at the same time as your Terbit wind-down (22:30). iPhone Settings → Focus → Sleep.',
    );
    expect(text).not.toMatch(/Terbit MY (turns|switches|will turn)|automatically/i);
  });

  it('no screen claims notification control or automatic Focus (source scan)', () => {
    const { readdirSync, readFileSync, statSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
      });
    const root = join(__dirname, '..', '..');
    const source = [...files(join(root, 'app')), ...files(join(root, 'features', 'night')), ...files(join(root, 'features', 'today'))]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/notifications?\s+(are\s+)?(blocked|disabled|silenced|muted)/i);
    expect(source).not.toMatch(/silenced by Terbit|turns? on (Sleep )?Focus (for you|automatically)/i);
  });

  it('Available Sleep Window is a duration, never called sleep', () => {
    expect(formatDuration(450)).toBe('7h 30m');
    expect(formatDuration(480)).toBe('8h');
    expect(formatDuration(45)).toBe('45m');
  });
});
