import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
import { formatLastSynced, syncStatusLabel } from './status-label';
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
  const state = createMemorySyncStateRepository();
  /** A sync engine as the app builds one at start-up (a "restart" builds another on the same phone data). */
  const newEngine = () =>
    createSyncEngine({
      local: {
        alarms: async () => [...alarms.values()],
        occurrences: async () => [...mornings],
        xp: async () => (await repo.listXp()),
        achievements: async () => repo.listUnlocked(),
      },
      store: remote.cloud.store,
      state,
      currentUser: () => remote.cloud.auth.currentUser(),
      now: () => clock.time,
    });
  const engine = newEngine();
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
  return { remote, alarms, mornings, progress, engine, newEngine, account, saveAlarm, completeMorning, signIn, clock, repo };
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

  it('a server error shows "Sync failed", keeps the rest pending, and a retry finishes the job', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.completeMorning(1);
    ctx.remote.state.failNext = 1;
    const failed = await ctx.engine.sync();
    expect(failed.state).toBe('error');
    expect(syncStatusLabel(failed).title).toBe('Sync failed');
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

describe('Phase 5A: status the user can understand', () => {
  it('Sync pending after a local change, then Synced with the time', async () => {
    const ctx = setup();
    await ctx.signIn();
    await ctx.engine.sync();
    ctx.saveAlarm('a1');
    ctx.engine.markChanged();
    expect(syncStatusLabel(ctx.engine.getStatus()).title).toBe('Sync pending');
    const done = await ctx.engine.sync();
    expect(syncStatusLabel(done, ctx.clock.time)).toEqual({ title: 'Synced', detail: `Last synced ${formatLastSynced(ctx.clock.time, ctx.clock.time)}.` });
    // Nothing to mark while signed out or offline.
    ctx.engine.reset();
    ctx.engine.markChanged();
    expect(ctx.engine.getStatus().state).toBe('local');
  });

  it('a rejected sign-in shows "Sign-in required", keeps changes, and recovers on retry', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    ctx.remote.state.failNext = 1;
    ctx.remote.state.failKind = 'auth';
    const failed = await ctx.engine.sync();
    expect(failed).toMatchObject({ state: 'signin_required', pending: 1 });
    expect(syncStatusLabel(failed).title).toBe('Sign-in required');
    expect(await ctx.engine.sync()).toMatchObject({ state: 'synced', pending: 0 });
  });

  it('offline says how many changes are waiting and when it last synced; never a raw error', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.engine.sync();
    const syncedAt = ctx.clock.time;
    ctx.remote.state.online = false;
    ctx.saveAlarm('a2');
    const offline = await ctx.engine.sync();
    const label = syncStatusLabel(offline, syncedAt);
    expect(label.title).toBe('Offline');
    expect(label.detail).toContain('1 change will back up when you’re online.');
    expect(label.detail).toContain(`Last synced ${formatLastSynced(syncedAt, syncedAt)}.`);
    expect(offline.lastError).toMatch(/Network request failed/); // kept for the developer panel only
    for (const state of ['local', 'pending', 'syncing', 'synced', 'offline', 'signin_required', 'error'] as const) {
      expect(JSON.stringify(syncStatusLabel({ ...offline, state, lastError: 'PGRST301 secret detail' }))).not.toMatch(/PGRST|secret detail|Network request/);
    }
  });

  it('“Last synced” survives a restart (read from the phone’s sync record)', async () => {
    const ctx = setup();
    await ctx.signIn();
    ctx.saveAlarm('a1');
    await ctx.engine.sync();
    const at = ctx.clock.time;
    ctx.clock.time += 3_600_000;
    ctx.remote.state.online = false; // restarted offline
    // Nothing waiting: up to date as of the last real backup (not "now").
    expect(await ctx.newEngine().sync()).toMatchObject({ state: 'synced', lastSyncedAt: at, pending: 0 });
    ctx.saveAlarm('a2');
    expect(await ctx.newEngine().sync()).toMatchObject({ state: 'offline', lastSyncedAt: at, pending: 1 });
  });

  it('dates other than today are shown with the day', () => {
    const today = new Date(2026, 9, 13, 14, 5).getTime();
    expect(formatLastSynced(today, today)).not.toMatch(/Oct/);
    expect(formatLastSynced(new Date(2026, 9, 12, 9, 0).getTime(), today)).toMatch(/12/);
  });
});

describe('Phase 5A: the full account lifecycle never duplicates anything', () => {
  it('guest data → sign in → sync twice → restart → sign out → guest use → sign in → offline change → reconnect', async () => {
    const ctx = setup();
    await ctx.account.start();
    // A guest with alarms, a weekday Main Wake-Up, history, XP, achievements and a streak.
    ctx.saveAlarm('a1', { isPrimary: true, weekdays: [1, 2, 3, 4, 5] });
    ctx.saveAlarm('evening', { hour: 21 });
    for (const day of [1, 2, 3]) await ctx.completeMorning(day);
    const guest = await ctx.progress.summary();
    expect(guest).toMatchObject({ xp: { total: 40 }, morning: { streak: { current: 3 } } });

    const cloudCounts = (userId: string) => ({
      alarms: ctx.remote.owned(ctx.remote.tables.alarms, userId).length,
      mains: ctx.remote.owned(ctx.remote.tables.alarms, userId).filter((a) => a.is_main_wake_up).length,
      occurrences: ctx.remote.owned(ctx.remote.tables.occurrences, userId).length,
      xp: ctx.remote.owned(ctx.remote.tables.xp, userId).reduce((n, e) => n + e.amount, 0),
      achievements: ctx.remote.owned(ctx.remote.tables.achievements, userId).length,
    });
    const expected = { alarms: 2, mains: 1, occurrences: 3, xp: 40, achievements: 2 };

    await ctx.signIn();
    const userId = ctx.account.getState().user!.id;
    await ctx.engine.sync();
    await ctx.engine.sync(); // twice in a row
    expect(cloudCounts(userId)).toEqual(expected);

    // Restart: a new engine on the same phone data sends nothing again.
    const calls = ctx.remote.state.calls;
    expect(await ctx.newEngine().sync()).toMatchObject({ state: 'synced', pending: 0 });
    expect(ctx.remote.state.calls).toBe(calls);

    // Sign out: everything local stays and keeps working.
    await ctx.account.signOut();
    expect(ctx.alarms.size).toBe(2);
    expect(await ctx.progress.summary()).toEqual(guest);
    await ctx.completeMorning(4); // used as a guest

    // Sign back in with the same account, then a change made offline.
    await ctx.signIn();
    expect(ctx.account.getState().user!.id).toBe(userId);
    await ctx.engine.sync();
    ctx.remote.state.online = false;
    await ctx.completeMorning(5);
    expect((await ctx.engine.sync()).state).toBe('offline');
    ctx.remote.state.online = true;
    expect(await ctx.engine.sync()).toMatchObject({ state: 'synced', pending: 0 });

    // Cloud mirrors the phone exactly: no second Main Wake-Up, no XP or occurrence twice.
    const local = await ctx.progress.summary();
    expect(cloudCounts(userId)).toEqual({ alarms: 2, mains: 1, occurrences: 5, xp: local.xp.total, achievements: (await ctx.repo.listUnlocked()).length });
    expect(local.morning.streak.current).toBe(5);
    expect(new Set(ctx.remote.owned(ctx.remote.tables.occurrences, userId).map((o) => `${o.alarm_id}@${o.scheduled_at}`)).size).toBe(5);
  });

  it('rows already in the cloud (same IDs) are kept once; the phone’s copies are not changed', async () => {
    const ctx = setup();
    ctx.saveAlarm('a1', { isPrimary: true });
    await ctx.completeMorning(1);
    await ctx.signIn();
    const userId = ctx.account.getState().user!.id;
    // The same records reached the cloud before (e.g. a sync whose reply was lost).
    const xp = await ctx.repo.listXp();
    await ctx.remote.cloud.store.pushXp(xp.map((e) => ({ award_key: e.key, occurrence_id: e.occurrenceId, category: e.category, amount: e.amount, reason: e.reason, earned_at: e.earnedAt })));
    await ctx.remote.cloud.store.pushAlarms([alarmToCloud(ctx.alarms.get('a1')!)]);
    await ctx.engine.sync();
    expect(ctx.remote.owned(ctx.remote.tables.xp, userId)).toHaveLength(xp.length);
    expect(ctx.remote.owned(ctx.remote.tables.alarms, userId)).toHaveLength(1);
    expect((await ctx.progress.summary()).xp.total).toBe(10);
  });

  it('the Night Routine never enters cloud sync (phone only)', () => {
    const src = (p: string) => readFileSync(join(__dirname, p), 'utf8');
    for (const file of ['sync.ts', 'sync-engine.ts', 'mapping.ts', 'sync-state-repository.ts']) {
      expect(src(file)).not.toMatch(/night|screen.?time|selection/i);
    }
    expect(Object.keys(createMemoryCloud().tables)).toEqual(['profiles', 'alarms', 'occurrences', 'xp', 'achievements']);
  });
});

describe('Phase 5A: session', () => {
  it('Supabase ending the session (not the user) shows "Sign-in required"; local data stays', async () => {
    const ctx = setup();
    ctx.saveAlarm('a1');
    await ctx.signIn();
    await ctx.remote.cloud.auth.signOut(); // e.g. the refresh token was revoked
    expect(ctx.account.getState()).toMatchObject({ status: 'guest', sessionEnded: true });
    expect(ctx.alarms.size).toBe(1);
    await ctx.signIn();
    expect(ctx.account.getState()).toMatchObject({ status: 'signed_in', sessionEnded: false });
  });

  it('a deliberate sign-out or account deletion is not “Sign-in required”', async () => {
    const ctx = setup();
    await ctx.signIn();
    await ctx.account.signOut();
    expect(ctx.account.getState()).toMatchObject({ status: 'guest', sessionEnded: false });
    await ctx.signIn('other@example.com');
    await ctx.account.deleteAccount();
    expect(ctx.account.getState()).toMatchObject({ status: 'guest', sessionEnded: false });
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
    // "Last synced" per account.
    await repo.mark('u1', 'xp', [{ id: 'k', fingerprint: 'f' }], 9);
    expect(await repo.lastSyncedAt!('u1')).toBe(9);
    expect(await repo.lastSyncedAt!('u2')).toBe(3);
    expect(await repo.lastSyncedAt!('nobody')).toBeNull();
  });

  it('fingerprints depend on content, not key order', () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
