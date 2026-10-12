import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAccountStore } from '@/features/account/account-store';
import { createSyncEngine } from '@/features/sync/sync-engine';
import { createMemorySyncStateRepository } from '@/features/sync/sync-state-repository';
import { createMemoryCloud } from '@/services/cloud/testing/memory-cloud';
import { migrate } from '@/services/storage/migrations';
import { createSqliteSettingsStore } from '@/services/storage/settings';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import {
  createFaithSettingsStore,
  faithMissionKinds,
  normaliseFaithSettings,
  primaryTradition,
  visibleTraditions,
} from './faith-settings';
import { PUBLIC_PROFILE_FIELDS, toPublicProfile } from './privacy';
import { DEFAULT_FAITH_SETTINGS, type FaithSettings } from './types';

const settings = (change: Partial<FaithSettings>): FaithSettings => ({ ...DEFAULT_FAITH_SETTINGS, ...change });

async function sqliteStore() {
  const db = openTestDatabase();
  await migrate(db);
  return { db, store: () => createFaithSettingsStore(createSqliteSettingsStore(db)) };
}

describe('Faith preference (local, guest)', () => {
  it('a guest can set a preference with no account, and it persists on the phone after a restart', async () => {
    const { store } = await sqliteStore();
    const first = store();
    expect((await first.get()).primary).toBeNull();
    await first.update({ primary: 'christianity' });

    const restarted = store();
    expect(await restarted.get()).toMatchObject({ primary: 'christianity', exploreOtherTraditions: false });
  });

  it('switching the primary faith switches the default Recitation tradition', async () => {
    const { store } = await sqliteStore();
    const s = store();
    await s.update({ primary: 'islam' });
    expect(primaryTradition(await s.get())).toBe('islam');
    await s.update({ primary: 'hinduism' });
    expect(primaryTradition(await s.get())).toBe('hinduism');
    expect(visibleTraditions(await s.get())).toEqual(['hinduism']);
  });

  it('reads damaged or older stored values safely', () => {
    expect(normaliseFaithSettings({ primary: 'unknown', exploreOtherTraditions: 'yes', display: null })).toEqual(DEFAULT_FAITH_SETTINGS);
    expect(normaliseFaithSettings(null)).toEqual(DEFAULT_FAITH_SETTINGS);
  });
});

describe('default Faith experience and "Explore other faith traditions"', () => {
  it('shows only the user’s own tradition by default: Recitation first, then Reflection, then both', () => {
    const islam = settings({ primary: 'islam' });
    expect(visibleTraditions(islam)).toEqual(['islam']);
    expect(faithMissionKinds(islam)).toEqual(['recitation', 'reflection', 'recitation_reflection']);
  });

  it('Non-religious, Prefer not to say or not chosen: Reflection is the default and Recitation is hidden', () => {
    for (const primary of ['non_religious', 'prefer_not_to_say', null] as const) {
      const s = settings({ primary });
      expect(visibleTraditions(s)).toEqual([]);
      expect(faithMissionKinds(s)).toEqual(['reflection']);
    }
  });

  it('Explore ON shows every tradition (own first) and never changes the primary preference', async () => {
    expect(visibleTraditions(settings({ primary: 'buddhism', exploreOtherTraditions: true }))).toEqual([
      'buddhism',
      'islam',
      'christianity',
      'hinduism',
    ]);
    // Without a tradition of their own, exploring makes Recitation available but Reflection stays the default.
    expect(faithMissionKinds(settings({ primary: 'non_religious', exploreOtherTraditions: true }))).toEqual([
      'reflection',
      'recitation',
      'recitation_reflection',
    ]);

    const { store } = await sqliteStore();
    const s = store();
    await s.update({ primary: 'islam' });
    await s.update({ exploreOtherTraditions: true });
    expect(await s.get()).toMatchObject({ primary: 'islam', exploreOtherTraditions: true });
  });

  it('Reflection / Meditation is available to everyone', () => {
    for (const primary of ['islam', 'christianity', 'buddhism', 'hinduism', 'non_religious', 'prefer_not_to_say', null] as const) {
      expect(faithMissionKinds(settings({ primary }))).toContain('reflection');
    }
  });
});

describe('privacy: Faith preference is never public', () => {
  it('the only profile fields that may ever be shown to others exclude faith', () => {
    expect(PUBLIC_PROFILE_FIELDS).not.toContain('faithPreference');
    const shared = toPublicProfile({ displayName: 'Arif', avatarUrl: null, faithPreference: 'islam', timezone: 'Asia/Kuala_Lumpur' });
    expect(shared).toEqual({ displayName: 'Arif', avatarUrl: null });
    expect(JSON.stringify(shared)).not.toMatch(/islam|faith/i);
  });

  it('the cloud stores it on the private profile only (owner-only RLS), with no public view or grant', () => {
    const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
      .toLowerCase();
    expect(sql).toMatch(/alter table public\.profiles\s+add column faith_preference text/);
    expect(sql).not.toMatch(/create (or replace )?view/);
    expect(sql).not.toMatch(/grant [^;]* to anon/);
    // profiles: read own only.
    expect(sql).toMatch(/create policy "[^"]+" on public\.profiles for select to authenticated using \(\(select auth\.uid\(\)\) = id\)/);
  });
});

describe('Faith preference and the optional account', () => {
  function setup(faithPreference: string | null) {
    const remote = createMemoryCloud();
    const engine = createSyncEngine({
      local: {
        alarms: async () => [],
        occurrences: async () => [],
        xp: async () => [],
        achievements: async () => [],
        privateProfile: async () => ({ faithPreference }),
      },
      store: remote.cloud.store,
      state: createMemorySyncStateRepository(),
      currentUser: () => remote.cloud.auth.currentUser(),
    });
    const account = createAccountStore({ cloud: remote.cloud, timeZone: () => 'Asia/Kuala_Lumpur' });
    const signIn = async () => {
      await account.start();
      await account.sendCode('arif@example.com');
      await account.verifyCode('arif@example.com', '123456');
    };
    return { remote, engine, signIn };
  }

  it('a guest’s preference stays on the phone (no cloud calls)', async () => {
    const ctx = setup('islam');
    expect(await ctx.engine.sync()).toMatchObject({ state: 'local' });
    expect(ctx.remote.state.calls).toBe(0);
  });

  it('after sign-in it syncs to the user’s private profile, once', async () => {
    const ctx = setup('christianity');
    await ctx.signIn();
    await ctx.engine.sync();
    const userId = [...ctx.remote.users.keys()][0];
    expect(ctx.remote.tables.profiles.get(userId)?.faithPreference).toBe('christianity');
    const calls = ctx.remote.state.calls;
    expect(await ctx.engine.sync()).toMatchObject({ state: 'synced', pending: 0 });
    expect(ctx.remote.state.calls).toBe(calls); // nothing re-sent
  });

  it('an unset preference never clears one already in the cloud', async () => {
    const ctx = setup(null);
    await ctx.signIn();
    const userId = [...ctx.remote.users.keys()][0];
    ctx.remote.tables.profiles.set(userId, { ...ctx.remote.tables.profiles.get(userId)!, faithPreference: 'buddhism' });
    await ctx.engine.sync();
    expect(ctx.remote.tables.profiles.get(userId)?.faithPreference).toBe('buddhism');
  });
});
