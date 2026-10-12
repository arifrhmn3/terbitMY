import { describe, expect, it } from '@jest/globals';

import { createAccountStore } from '@/features/account/account-store';
import { createAlarmDraft, type Alarm } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { dayKeyAtOffset } from '@/features/progress/day';
import { buildMorning } from '@/features/progress/example-mornings';
import { createProgressEngine } from '@/features/progress/progress-engine';
import { createMemoryProgressRepository } from '@/features/progress/progress-repository';
import { createMemoryCloud } from '@/services/cloud/testing/memory-cloud';
import { migrate } from '@/services/storage/migrations';
import { createMemorySettingsStore } from '@/services/storage/settings';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import { newerWins } from './conflict';
import { alarmToCloud, fingerprint } from './mapping';
import { syncStatusLabel } from './status-label';
import { createSyncEngine } from './sync-engine';
import { createMemorySyncStateRepository, createSqliteSyncStateRepository } from './sync-state-repository';

const myt = (day: number, hour = 6) => Date.UTC(2026, 9, day, hour - 8, 30);

/** A phone (local SQLite stand-ins + progression) and the memory cloud, wired like the app. */
function setup() {
  const remote = createMemoryCloud();
  const alarms = new Map<string, Alarm>();
  const mornings: AlarmOccurrence[] = [];
  const clock = { time: myt(20, 12) };
  const progress = createProgressEngine({
    history: { listSince: async (since) => mornings.filter((o) => o.scheduledAt >= since) },
    repository: async () => repo,
    settings: createMemorySettingsStore(),
    now: () => clock.time,
    dayKey: dayKeyAtOffset(480),
  });
  const repo = createMemoryProgressRepository();
  const engine = createSyncEngine({
    local: {
      alarms: async () => [...alarms.values()],
      occurrences: async () => [...mornings],
      xp: async () => (await repo.listXp()),
      achievements: async () => repo.listUnlocked(),
    },
    store: remote.cloud.store,
    state: createMemorySyncStateRepository(),
    currentUser: () => remote.cloud.auth.currentUser(),
    now: () => clock.time,
  });
  const account = createAccountStore({
    cloud: remote.cloud,
    onSignedIn: () => void engine.sync(),
    onSignedOut: () => engine.reset(),
    timeZone: () => 'Asia/Kuala_Lumpur',
  });

  const saveAlarm = (id: string, overrides: Partial<Alarm> = {}) => {
    const alarm: Alarm = { ...createAlarmDraft(), id, createdAt: clock.time, updatedAt: clock.time, ...overrides };
    alarms.set(id, alarm);
    return alarm;
  };
  let seq = 0;
  const completeMorning = async (day: number, mainWakeUp = true) => {
    seq += 1;
    const o = buildMorning({ id: `occ-${seq}`, alarmId: 'a1', scheduledAt: myt(day), outcome: 'completed', mainWakeUp });
    mornings.push(o);
    await progress.sync();
    return o;
  };
  const signIn = async (email = 'arif@example.com') => {
    await account.start();
    await account.sendCode(email);
    await account.verifyCode(email, '123456');
  };
  return { remote, alarms, mornings, progress, engine, account, saveAlarm, completeMorning, signIn, clock, repo };
}

describe('guest (local-only) use', () => {
  it('works fully without an account and never touches the cloud', async () => {
    const ctx = setup();
    await ctx.account.start();
    expect(ctx.account.getState().status).toBe('guest');

    ctx.saveAlarm('a1', { isPrimary: true });
    for (const day of [1, 2, 3]) await ctx.completeMorning(day);
    const s = await ctx.progress.summary();
    expect(s.xp.total).toBe(40); // 3 × 10 + 3-day streak bonus
    expect(s.morning.streak.current).toBe(3);

    expect(await ctx.engine.sync()).toMatchObject({ state: 'local', pending: 0 });
    expect(ctx.remote.state.calls).toBe(0);
  });

  it('a build without a cloud is "unavailable" and stays local', async () => {
    const account = createAccountStore({ cloud: null });
    await account.start();
    expect(account.getState().status).toBe('unavailable');
    const engine = createSyncEngine({
      local: { alarms: async () => [], occurrences: async () => [], xp: async () => [], achievements: async () => [] },
      store: null,
      state: createMemorySyncStateRepository(),
      currentUser: async () => null,
    });
    expect((await engine.sync()).state).toBe('local');
  });
});

describe('authentication and profile', () => {
  it('signs in with an emailed code, creates the profile with the time zone, and restores the session', async () => {
    const ctx = setup();
    await ctx.signIn();
    const state = ctx.account.getState();
    expect(state).toMatchObject({ status: 'signed_in', user: { email: 'arif@example.com' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.remote.tables.profiles.get(state.user!.id)).toMatchObject({ timezone: 'Asia/Kuala_Lumpur' });

    // App restart: a fresh store restores the saved session without signing in again.
    const restarted = createAccountStore({ cloud: ctx.remote.cloud });
    await restarted.start();
    expect(restarted.getState()).toMatchObject({ status: 'signed_in', user: { id: state.user!.id } });
  });

  it('rejects a wrong code and stays a guest', async () => {
    const ctx = setup();
    await ctx.account.start();
    await ctx.account.sendCode('arif@example.com');
    await expect(ctx.account.verifyCode('arif@example.com', '000000')).rejects.toThrow();
    expect(ctx.account.getState().status).toBe('guest');
  });

  it('saves a display name (trimmed, max 50 characters)', async () => {
    const ctx = setup();
    await ctx.signIn();
    await ctx.account.setDisplayName(`  ${'A'.repeat(60)}  `);
    const id = ctx.account.getState().user!.id;
    expect(ctx.remote.tables.profiles.get(id)?.displayName).toHaveLength(50);
  });
});

describe('guest → account', () => {
  it('backs up everything the guest already had, without changing it locally', async () => {
    const ctx = setup();
    await ctx.account.start();
    ctx.saveAlarm('a1', { isPrimary: true });
    ctx.saveAlarm('evening', { hour: 19 });
    for (const day of [1, 2, 3]) await ctx.completeMorning(day);
    const before = await ctx.progress.summary();

    await ctx.signIn();
    const status = await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;

    expect(status).toMatchObject({ state: 'synced', pending: 0, userId });
    expect(ctx.remote.owned(ctx.remote.tables.alarms, userId).map((a) => a.id).sort()).toEqual(['a1', 'evening']);
    expect(ctx.remote.owned(ctx.remote.tables.occurrences, userId)).toHaveLength(3);
    expect(ctx.remote.owned(ctx.remote.tables.occurrences, userId).every((o) => o.was_main_wake_up)).toBe(true);
    expect(ctx.remote.owned(ctx.remote.tables.xp, userId).reduce((n, e) => n + e.amount, 0)).toBe(40);
    expect(ctx.remote.owned(ctx.remote.tables.achievements, userId).map((a) => a.id)).toEqual(['first_morning', 'streak_3']);
    // Local progression is exactly as before.
    expect(await ctx.progress.summary()).toEqual(before);
  });

  it('signing out keeps every local record; signing in again sends only what changed', async () => {
    const ctx = setup();
    ctx.saveAlarm('a1', { isPrimary: true });
    await ctx.completeMorning(1);
    await ctx.signIn();
    await ctx.engine.sync();

    await ctx.account.signOut();
    expect(ctx.account.getState().status).toBe('guest');
    expect(ctx.engine.getStatus().state).toBe('local');
    expect(ctx.alarms.size).toBe(1);
    expect(ctx.mornings).toHaveLength(1);
    expect((await ctx.progress.summary()).xp.total).toBe(10);

    // Used as a guest for a day, then signed in again.
    await ctx.completeMorning(2);
    await ctx.signIn();
    const calls = ctx.remote.state.calls;
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;
    expect(ctx.remote.owned(ctx.remote.tables.occurrences, userId)).toHaveLength(2);
    // Only the new occurrence and its XP were sent (2 pushes), nothing else again.
    expect(ctx.remote.state.calls - calls).toBe(2);
  });
});

describe('local-first sync, offline queue and retry', () => {
  it('writes locally while offline, keeps changes pending, and sends them after reconnecting', async () => {
    const ctx = setup();
    await ctx.signIn();
    await ctx.engine.sync();

    ctx.remote.state.online = false;
    ctx.saveAlarm('a1', { isPrimary: true });
    await ctx.completeMorning(1); // local write succeeds offline
    expect((await ctx.progress.summary()).xp.total).toBe(10);

    const offline = await ctx.engine.sync();
    expect(offline.state).toBe('offline');
    expect(offline.pending).toBe(4); // alarm, occurrence, XP line, achievement
    expect(syncStatusLabel(offline).title).toBe('Offline');

    ctx.remote.state.online = true;
    const back = await ctx.engine.sync();
    expect(back).toMatchObject({ state: 'synced', pending: 0, lastError: null });
    expect(syncStatusLabel(back).title).toBe('Synced');
  });

  it('a server error shows "Sync problem", keeps the rest pending, and a retry finishes the job', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.completeMorning(1);
    ctx.remote.state.failNext = 1;
    const failed = await ctx.engine.sync();
    expect(failed.state).toBe('error');
    expect(syncStatusLabel(failed).title).toBe('Sync problem');
    expect(failed.pending).toBeGreaterThan(0);
    expect(await ctx.engine.sync()).toMatchObject({ state: 'synced', pending: 0 });
  });

  it('progression never depends on the cloud: failing sync changes nothing locally', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.remote.state.online = false;
    ctx.saveAlarm('a1', { isPrimary: true });
    for (const day of [1, 2, 3]) await ctx.completeMorning(day);
    await ctx.engine.sync();
    const s = await ctx.progress.summary();
    expect(s.xp).toEqual({ total: 40, byCategory: { education: 30, fitness: 0, faith: 0 }, general: 10 });
    expect(s.morning).toMatchObject({ successful: 3, scheduled: 3, streak: { current: 3 } });
  });
});

describe('idempotency and duplicates', () => {
  it('a second sync sends nothing', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.completeMorning(1);
    await ctx.engine.sync();
    const calls = ctx.remote.state.calls;
    expect(await ctx.engine.sync()).toMatchObject({ state: 'synced', pending: 0 });
    expect(ctx.remote.state.calls).toBe(calls);
  });

  it('re-sending everything (e.g. sync state lost) never duplicates events', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1', { isPrimary: true });
    for (const day of [1, 2, 3]) await ctx.completeMorning(day);
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;
    const count = () => ({
      occurrences: ctx.remote.owned(ctx.remote.tables.occurrences, userId).length,
      xp: ctx.remote.owned(ctx.remote.tables.xp, userId).length,
      achievements: ctx.remote.owned(ctx.remote.tables.achievements, userId).length,
    });
    const before = count();

    // A second engine with empty sync state (like a reinstall that kept the database) re-sends everything.
    const fresh = createSyncEngine({
      local: {
        alarms: async () => [...ctx.alarms.values()],
        occurrences: async () => [...ctx.mornings],
        xp: () => ctx.repo.listXp(),
        achievements: () => ctx.repo.listUnlocked(),
      },
      store: ctx.remote.cloud.store,
      state: createMemorySyncStateRepository(),
      currentUser: () => ctx.remote.cloud.auth.currentUser(),
    });
    expect((await fresh.sync()).state).toBe('synced');
    expect(count()).toEqual(before);
  });
});

describe('conflicts', () => {
  it('newest updated_at wins; an equal time takes the incoming copy', () => {
    const a = { id: 'x', updated_at: 100, label: 'phone' };
    expect(newerWins(a, { ...a, updated_at: 200, label: 'newer' }).label).toBe('newer');
    expect(newerWins(a, { ...a, updated_at: 50, label: 'older' }).label).toBe('phone');
    expect(newerWins(a, { ...a, label: 'same time' }).label).toBe('same time');
    expect(newerWins(null, a)).toBe(a);
  });

  it('an older phone copy of an alarm never overwrites a newer cloud copy (e.g. edited on another phone)', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1', { label: 'old', updatedAt: myt(1) });
    // Another device already saved a newer edit.
    await ctx.remote.cloud.store.pushAlarms([{ ...alarmToCloud(ctx.alarms.get('a1')!), label: 'edited elsewhere', updated_at: myt(2) }]);
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;
    expect(ctx.remote.owned(ctx.remote.tables.alarms, userId)[0].label).toBe('edited elsewhere');
    // A newer local edit does win.
    ctx.saveAlarm('a1', { label: 'newest', updatedAt: myt(3) });
    await ctx.engine.sync();
    expect(ctx.remote.owned(ctx.remote.tables.alarms, userId)[0].label).toBe('newest');
  });

  it('catches changes that don’t touch updated_at (another alarm losing the Main Wake-Up flag)', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1', { isPrimary: true });
    ctx.saveAlarm('a2');
    await ctx.engine.sync();
    // The repository demotes a1 without changing its updated_at when a2 becomes main.
    ctx.alarms.set('a1', { ...ctx.alarms.get('a1')!, isPrimary: false });
    ctx.alarms.set('a2', { ...ctx.alarms.get('a2')!, isPrimary: true, updatedAt: ctx.clock.time + 1 });
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;
    const main = ctx.remote.owned(ctx.remote.tables.alarms, userId).filter((a) => a.is_main_wake_up).map((a) => a.id);
    expect(main).toEqual(['a2']);
  });

  it('an alarm deleted on the phone becomes a tombstone in the cloud', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.engine.sync();
    ctx.alarms.delete('a1');
    ctx.clock.time += 60_000;
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;
    expect(ctx.remote.owned(ctx.remote.tables.alarms, userId)[0].deleted_at).toBe(ctx.clock.time);
    expect(await ctx.engine.pendingCount(userId)).toBe(0);
  });
});

describe('privacy: each account sees only its own rows (RLS stand-in)', () => {
  it('a second account on the same phone gets its own copy; neither can read the other’s profile', async () => {
    const ctx = setup();
    ctx.saveAlarm('a1');
    await ctx.signIn('first@example.com');
    await ctx.engine.sync();
    const first = ctx.account.getState().user!.id;
    await ctx.account.signOut();

    await ctx.signIn('second@example.com');
    await ctx.engine.sync();
    const second = ctx.account.getState().user!.id;
    expect(second).not.toBe(first);
    expect(ctx.remote.owned(ctx.remote.tables.alarms, second)).toHaveLength(1);
    expect(await ctx.remote.cloud.store.getProfile(first)).toBeNull();
  });
});

describe('account deletion', () => {
  it('removes the profile and all cloud rows, signs out, and keeps local data', async () => {
    const ctx = setup();
    ctx.saveAlarm('a1', { isPrimary: true });
    await ctx.completeMorning(1);
    await ctx.signIn();
    await ctx.engine.sync();
    const userId = ctx.account.getState().user!.id;

    await ctx.account.deleteAccount();
    expect(ctx.account.getState().status).toBe('guest');
    for (const table of [ctx.remote.tables.alarms, ctx.remote.tables.occurrences, ctx.remote.tables.xp, ctx.remote.tables.achievements]) {
      expect(ctx.remote.owned(table as never, userId)).toHaveLength(0);
    }
    expect(ctx.remote.tables.profiles.has(userId)).toBe(false);
    expect(ctx.alarms.size).toBe(1);
    expect((await ctx.progress.summary()).xp.total).toBe(10);
  });
});

describe('sync state on real SQLite (migration 8)', () => {
  it('records fingerprints per account and entity', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const repo = createSqliteSyncStateRepository(db);
    await repo.mark('u1', 'alarm', [{ id: 'a1', fingerprint: 'f1' }], 1);
    await repo.mark('u1', 'alarm', [{ id: 'a1', fingerprint: 'f2' }], 2);
    await repo.mark('u2', 'alarm', [{ id: 'a1', fingerprint: 'g1' }], 3);
    expect(await repo.fingerprints('u1', 'alarm')).toEqual(new Map([['a1', 'f2']]));
    expect(await repo.fingerprints('u2', 'alarm')).toEqual(new Map([['a1', 'g1']]));
    await repo.forget('u1', 'alarm', ['a1']);
    expect((await repo.fingerprints('u1', 'alarm')).size).toBe(0);
  });

  it('fingerprints depend on content, not key order', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
