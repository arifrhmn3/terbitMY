import { describe, expect, it, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createAccountStore } from '@/features/account/account-store';
import { CloudError } from '@/services/cloud/types';
import { createMemoryCloud } from '@/services/cloud/testing/memory-cloud';
import { createMemorySettingsStore, type SettingsStore } from '@/services/storage/settings';

import { CIRCLES_CACHE_KEY, createCirclesStore } from './circles-store';
import { circleRowSubtitle, circlesNotice, memberRowLabel } from './labels';
import { CIRCLE_MESSAGES, friendlyCircleError } from './messages';
import {
  checkName,
  formatInviteCode,
  inviteExpiryLabel,
  inviteShareMessage,
  isCompleteInviteCode,
  normaliseInviteCode,
} from './validation';

const DAY = 86_400_000;

/** A memory cloud, an account store and a Circles store, wired like the app. */
function setup(options: { settings?: SettingsStore; remote?: ReturnType<typeof createMemoryCloud> } = {}) {
  const remote = options.remote ?? createMemoryCloud();
  const settings = options.settings ?? createMemorySettingsStore();
  const account = createAccountStore({ cloud: remote.cloud, timeZone: () => 'Asia/Kuala_Lumpur' });
  const store = createCirclesStore({ cloud: remote.cloud, account, settings, dev: false });
  async function signIn(email: string) {
    await account.start();
    if (account.getState().user) await account.signOut();
    await account.sendCode(email);
    await account.verifyCode(email, '123456');
    await flush();
  }
  return { remote, settings, account, store, signIn };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function expectOk<T extends { ok: boolean }>(outcome: T): Extract<T, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  return outcome as Extract<T, { ok: true }>;
}

/** Owner creates "Morning Crew" and returns its id and code. */
async function ownerWithCircle(ctx: ReturnType<typeof setup>, email = 'owner@example.com') {
  await ctx.signIn(email);
  ctx.store.start();
  await ctx.store.refresh();
  expectOk(await ctx.store.setDisplayName('Olivia'));
  const created = expectOk(await ctx.store.create('Morning Crew'));
  const code = ctx.store.getState().invites[created.circleId].code;
  return { circleId: created.circleId, code, ownerId: ctx.account.getState().user!.id };
}

describe('names and invite codes', () => {
  it('names are required, trimmed and at most 40 characters; duplicates are fine', () => {
    expect(checkName('  Morning Crew  ')).toEqual({ ok: true, name: 'Morning Crew' });
    expect(checkName('   ')).toEqual({ ok: false, problem: 'Enter a name.' });
    expect(checkName('x'.repeat(41))).toEqual({ ok: false, problem: 'Use 40 characters or fewer.' });
    expect(checkName('x'.repeat(40)).ok).toBe(true);
    expect(checkName('Line\nbreak').ok).toBe(false);
  });

  it('codes are 8 Crockford characters, typed any way', () => {
    expect(normaliseInviteCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normaliseInviteCode('O1LI')).toBe('0111'); // look-alikes
    expect(isCompleteInviteCode('abcd-efgh')).toBe(true);
    expect(isCompleteInviteCode('ABCDEFG')).toBe(false);
    expect(isCompleteInviteCode('ABCDEFGU')).toBe(false); // U is not in the alphabet
    expect(formatInviteCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('expiry labels', () => {
    const now = Date.parse('2026-10-14T00:00:00Z');
    expect(inviteExpiryLabel(new Date(now + 6.5 * DAY).toISOString(), now)).toBe('Expires in 6 days');
    expect(inviteExpiryLabel(new Date(now + 1.2 * DAY).toISOString(), now)).toBe('Expires in 1 day');
    expect(inviteExpiryLabel(new Date(now + 3_600_000).toISOString(), now)).toBe('Expires today');
    expect(inviteExpiryLabel(new Date(now - 1).toISOString(), now)).toBe('Expired');
  });

  it('the share message contains only the Circle name and the code', () => {
    expect(inviteShareMessage('Family', 'ABCDEFGH')).toBe(
      'Join my Terbit MY Circle “Family”. Open Circles → Join Circle and enter the code ABCD-EFGH.',
    );
  });
});

describe('plain-language errors', () => {
  it('maps failures to plain words without raw errors', () => {
    expect(friendlyCircleError(new CloudError('Network request failed', 'offline'), 'create', false)).toBe(CIRCLE_MESSAGES.offline);
    expect(friendlyCircleError(new CloudError('JWT expired', 'auth'), 'join', false)).toBe(CIRCLE_MESSAGES.signInAgain);
    expect(friendlyCircleError(new CloudError('relation "circles" does not exist', 'server'), 'create', false)).toBe(
      'Couldn’t create the Circle. Try again.',
    );
    expect(friendlyCircleError(new Error('pg 23505'), 'join', false)).not.toContain('23505');
    // Developer builds keep the technical detail in brackets.
    expect(friendlyCircleError(new Error('pg 23505'), 'join', true)).toContain('(pg 23505)');
  });

  it('labels', () => {
    expect(circleRowSubtitle({ id: 'c', name: 'A', role: 'owner', memberCount: 1 })).toBe('1 member · Owner');
    expect(circleRowSubtitle({ id: 'c', name: 'A', role: 'member', memberCount: 3 })).toBe('3 members');
    expect(memberRowLabel({ userId: 'u1', displayName: 'Ana', role: 'owner', joinedAt: '' }, 'u1')).toEqual({ title: 'Ana (you)', subtitle: 'Owner' });
    expect(memberRowLabel({ userId: 'u2', displayName: null, role: 'member', joinedAt: '' }, 'u1')).toEqual({ title: 'Member' });
    expect(circlesNotice({ status: 'ready', error: null, syncedAt: null })).toBeNull();
    expect(circlesNotice({ status: 'offline', error: 'x', syncedAt: null })?.title).toBe('Offline');
  });
});

describe('Circles: signed out and start-up', () => {
  it('without a cloud, Circles are unavailable; a guest sees the sign-in state and nothing is fetched', async () => {
    const none = createCirclesStore({
      cloud: null,
      account: createAccountStore({ cloud: null }),
      settings: createMemorySettingsStore(),
      dev: false,
    });
    none.start();
    expect(none.getState().status).toBe('unavailable');

    const ctx = setup();
    await ctx.account.start();
    ctx.store.start();
    expect(ctx.store.getState().status).toBe('signed_out');
    const calls = ctx.remote.state.calls;
    await ctx.store.refresh();
    expect(await ctx.store.create('Family')).toEqual({ ok: false, message: 'Sign in to create or join Circles.' });
    expect(await ctx.store.join('ABCDEFGH')).toEqual({ ok: false, message: 'Sign in to create or join Circles.' });
    expect(ctx.remote.state.calls).toBe(calls); // no cloud calls for a guest
  });

  it('starting the store fetches nothing; Circles load only when a screen asks', async () => {
    const ctx = setup();
    const list = jest.spyOn(ctx.remote.cloud.circles, 'listCircles');
    const identity = jest.spyOn(ctx.remote.cloud.circles, 'getMyIdentity');
    await ctx.signIn('a@example.com');
    ctx.store.start();
    await flush();
    expect(list).not.toHaveBeenCalled();
    expect(identity).not.toHaveBeenCalled();
    expect(ctx.store.getState().status).toBe('loading');
    await ctx.store.refresh();
    expect(list).toHaveBeenCalledTimes(1);
    expect(ctx.store.getState().status).toBe('ready');
  });

  it('the app’s start-up never imports Circles', () => {
    const root = join(__dirname, '..', '..', 'app');
    expect(readFileSync(join(root, '_layout.tsx'), 'utf8')).not.toMatch(/features\/circles/);
    expect(readFileSync(join(root, 'index.tsx'), 'utf8')).not.toMatch(/features\/circles/);
  });
});

describe('Circles: identity', () => {
  it('asks for a display name first; saves your own; duplicates allowed; nothing private', async () => {
    const ctx = setup();
    await ctx.signIn('a@example.com');
    ctx.store.start();
    await ctx.store.refresh();
    expect(ctx.store.getState()).toMatchObject({ identity: null, identityLoaded: true });
    expect(await ctx.store.create('Family')).toEqual({ ok: false, message: CIRCLE_MESSAGES.needsName });

    expect(await ctx.store.setDisplayName('   ')).toEqual({ ok: false, message: 'Enter a name.' });
    expectOk(await ctx.store.setDisplayName('  Same Name '));
    expect(ctx.store.getState().identity).toEqual({ displayName: 'Same Name' });
    expect(Object.keys(ctx.remote.circleTables.identities.get(ctx.account.getState().user!.id)!)).toEqual(['displayName']);

    await ctx.signIn('b@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Same Name')); // not unique
    expect(ctx.remote.circleTables.identities.size).toBe(2);
  });

  it('is separate from the private profile: changing one never changes the other', async () => {
    const ctx = setup();
    await ctx.signIn('a@example.com');
    ctx.store.start();
    await ctx.account.setDisplayName('Private Account Name');
    await ctx.store.refresh();
    expect(ctx.store.getState().identity).toBeNull(); // not copied from the profile
    expectOk(await ctx.store.setDisplayName('Circle Name'));
    expect(ctx.remote.tables.profiles.get(ctx.account.getState().user!.id)?.displayName).toBe('Private Account Name');
  });
});

describe('Circles: create, rename, dissolve', () => {
  it('the creator becomes the one owner and only member, with an invite code', async () => {
    const ctx = setup();
    const { circleId, code, ownerId } = await ownerWithCircle(ctx);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(ctx.store.getState().circles).toEqual([{ id: circleId, name: 'Morning Crew', role: 'owner', memberCount: 1 }]);
    const members = [...ctx.remote.circleTables.members.values()];
    expect(members).toEqual([expect.objectContaining({ circleId, userId: ownerId, role: 'owner' })]);
  });

  it('several Circles, same names allowed, bad names refused before any network call', async () => {
    const ctx = setup();
    await ownerWithCircle(ctx);
    expectOk(await ctx.store.create('Morning Crew'));
    expectOk(await ctx.store.create('Family'));
    const calls = ctx.remote.state.calls;
    expect(await ctx.store.create('  ')).toEqual({ ok: false, message: 'Enter a name.' });
    expect(ctx.remote.state.calls).toBe(calls);
    await ctx.store.refresh();
    expect(ctx.store.getState().circles.map((c) => c.name)).toEqual(['Morning Crew', 'Morning Crew', 'Family']);
  });

  it('owner renames and dissolves; members, invite and the private profile are handled correctly', async () => {
    const ctx = setup();
    const { circleId, code } = await ownerWithCircle(ctx);
    await ctx.account.setDisplayName('Private');
    expectOk(await ctx.store.rename(circleId, ' Family '));
    expect(ctx.store.getState().circles[0].name).toBe('Family');

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Ben'));
    expectOk(await ctx.store.join(code));

    await ctx.signIn('owner@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.dissolve(circleId));
    expect(ctx.store.getState().circles).toEqual([]);
    expect(ctx.remote.circleTables.members.size).toBe(0);
    expect(ctx.remote.circleTables.invites.size).toBe(0);
    expect(ctx.remote.tables.profiles.size).toBe(2); // accounts untouched

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expect(ctx.store.getState().circles).toEqual([]);
    expect(await ctx.store.preview(code)).toEqual({ ok: false, message: CIRCLE_MESSAGES.invalidCode });
  });
});

describe('Circles: joining by code', () => {
  it('preview shows only the name; join once; joining again is not a duplicate', async () => {
    const ctx = setup();
    const { circleId, code } = await ownerWithCircle(ctx);

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    // A name is needed to join, but not to preview.
    const preview = expectOk(await ctx.store.preview(formatInviteCode(code).toLowerCase()));
    expect(preview).toEqual({ ok: true, circleName: 'Morning Crew', alreadyMember: false });
    expect(await ctx.store.join(code)).toEqual({ ok: false, message: CIRCLE_MESSAGES.needsName });

    expectOk(await ctx.store.setDisplayName('Olivia')); // same name as the owner: fine
    expect(expectOk(await ctx.store.join(code))).toMatchObject({ circleId, circleName: 'Morning Crew', alreadyMember: false });
    expect(expectOk(await ctx.store.join(code))).toMatchObject({ alreadyMember: true });
    expect(expectOk(await ctx.store.preview(code)).alreadyMember).toBe(true);
    expect(ctx.remote.circleTables.members.size).toBe(2);

    await flush();
    expect(ctx.store.getState().circles).toEqual([{ id: circleId, name: 'Morning Crew', role: 'member', memberCount: 2 }]);
  });

  it('member list: Circle display names only, never email, Faith, time zone or progress', async () => {
    const ctx = setup();
    const { circleId, code } = await ownerWithCircle(ctx);
    await ctx.remote.cloud.store.upsertProfile(ctx.account.getState().user!.id, { faithPreference: 'islam', displayName: 'PRIVATE-NAME' });

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Ben'));
    expectOk(await ctx.store.join(code));
    expectOk(await ctx.store.loadCircle(circleId));

    const detail = ctx.store.getState().details[circleId];
    expect(detail.members.map((m) => [m.displayName, m.role])).toEqual([
      ['Olivia', 'owner'],
      ['Ben', 'member'],
    ]);
    for (const m of detail.members) expect(Object.keys(m).sort()).toEqual(['displayName', 'joinedAt', 'role', 'userId']);
    const everything = JSON.stringify(ctx.store.getState());
    for (const secret of ['islam', 'PRIVATE-NAME', 'owner@example.com', 'Asia/Kuala_Lumpur']) expect(everything).not.toContain(secret);
  });

  it('invalid, malformed, expired and brute-forced codes fail safely', async () => {
    const ctx = setup();
    const { code } = await ownerWithCircle(ctx);
    await ctx.signIn('outsider@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Cara'));

    const calls = ctx.remote.state.calls;
    expect(await ctx.store.join('ABC')).toEqual({ ok: false, message: CIRCLE_MESSAGES.invalidCode });
    expect(ctx.remote.state.calls).toBe(calls); // malformed: no network call

    for (let i = 0; i < 10; i++) {
      expect(await ctx.store.join(`ZZZZZZZ${i}`)).toEqual({ ok: false, message: CIRCLE_MESSAGES.invalidCode });
    }
    expect(await ctx.store.join(code)).toEqual({ ok: false, message: CIRCLE_MESSAGES.rateLimited });
    expect(ctx.store.getState().circles).toEqual([]);

    // After the 15-minute window, a code that has since expired (7 days) is still refused.
    const start = Date.now();
    ctx.remote.state.now = () => start + 8 * DAY;
    expect(await ctx.store.join(code)).toEqual({ ok: false, message: CIRCLE_MESSAGES.invalidCode });
  });

  it('a new code replaces the old one; only the owner can get one', async () => {
    const ctx = setup();
    const { circleId, code } = await ownerWithCircle(ctx);
    const fresh = expectOk(await ctx.store.newInvite(circleId)).invite;
    expect(fresh.code).not.toBe(code);

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Ben'));
    expect(await ctx.store.join(code)).toEqual({ ok: false, message: CIRCLE_MESSAGES.invalidCode });
    expectOk(await ctx.store.join(fresh.code));
    expect(expectOk(await ctx.store.invite(circleId)).invite).toBeNull(); // members can't see the code
    expect(await ctx.store.newInvite(circleId)).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
  });
});

describe('Circles: access rules (like RLS)', () => {
  it('a non-member can’t see, rename, dissolve or invite to a Circle', async () => {
    const ctx = setup();
    const { circleId } = await ownerWithCircle(ctx);
    await ctx.signIn('outsider@example.com');
    await ctx.store.refresh();
    expect(ctx.store.getState().circles).toEqual([]);
    expect(expectOk(await ctx.store.loadCircle(circleId)).gone).toBe(true);
    expect(await ctx.store.rename(circleId, 'Hacked')).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
    expect(await ctx.store.dissolve(circleId)).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
    expect(await ctx.store.newInvite(circleId)).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
    expect(ctx.remote.circleTables.circles.get(circleId)?.name).toBe('Morning Crew');
  });

  it('a member can’t rename or dissolve; leaving removes only them; the owner can’t leave', async () => {
    const ctx = setup();
    const { circleId, code } = await ownerWithCircle(ctx);
    expect(await ctx.store.leave(circleId)).toEqual({ ok: false, message: 'As the owner, you can delete this Circle instead.' });

    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Ben'));
    expectOk(await ctx.store.join(code));
    expect(await ctx.store.rename(circleId, 'Hacked')).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
    expect(await ctx.store.dissolve(circleId)).toEqual({ ok: false, message: CIRCLE_MESSAGES.notAllowed });
    expectOk(await ctx.store.leave(circleId));
    expect(ctx.store.getState().circles).toEqual([]);

    await ctx.signIn('owner@example.com');
    await ctx.store.refresh();
    expect(ctx.store.getState().circles).toEqual([{ id: circleId, name: 'Morning Crew', role: 'owner', memberCount: 1 }]);
  });

  it('deleting the owner’s account dissolves their Circles; other accounts are untouched', async () => {
    const ctx = setup();
    const { code } = await ownerWithCircle(ctx);
    await ctx.signIn('member@example.com');
    await ctx.store.refresh();
    expectOk(await ctx.store.setDisplayName('Ben'));
    expectOk(await ctx.store.join(code));

    await ctx.signIn('owner@example.com');
    await ctx.account.deleteAccount();
    expect(ctx.remote.circleTables.circles.size).toBe(0);
    expect(ctx.remote.circleTables.members.size).toBe(0);
    expect(ctx.remote.circleTables.identities.size).toBe(1); // Ben's
    expect(ctx.remote.tables.profiles.size).toBe(1);
  });
});

describe('Circles: offline and the phone cache', () => {
  it('offline shows the last known Circles, survives a restart, and never blocks', async () => {
    const settings = createMemorySettingsStore();
    const ctx = setup({ settings });
    const { circleId } = await ownerWithCircle(ctx);
    await ctx.store.refresh();
    expectOk(await ctx.store.loadCircle(circleId));

    ctx.remote.state.online = false;
    await ctx.store.refresh();
    expect(ctx.store.getState().status).toBe('offline');
    expect(ctx.store.getState().error).toBe(CIRCLE_MESSAGES.offline);
    expect(ctx.store.getState().circles).toHaveLength(1);
    expect(await ctx.store.create('Family')).toEqual({ ok: false, message: CIRCLE_MESSAGES.offline, offline: true });

    // "Restart" offline: a new store reads the cache for the same account.
    const again = createCirclesStore({ cloud: ctx.remote.cloud, account: ctx.account, settings, dev: false });
    again.start();
    await flush();
    await again.refresh();
    expect(again.getState()).toMatchObject({ status: 'offline', identity: { displayName: 'Olivia' } });
    expect(again.getState().circles.map((c) => c.name)).toEqual(['Morning Crew']);
    expect(again.getState().details[circleId].members).toHaveLength(1);
  });

  it('signing out clears Circles from the phone; another account never sees the cache', async () => {
    const settings = createMemorySettingsStore();
    const ctx = setup({ settings });
    await ownerWithCircle(ctx);
    expect(await settings.get(CIRCLES_CACHE_KEY)).not.toBeNull();

    await ctx.account.signOut();
    await flush();
    expect(ctx.store.getState()).toMatchObject({ status: 'signed_out', circles: [], identity: null });
    expect(await settings.get(CIRCLES_CACHE_KEY)).toBeNull();

    await ctx.signIn('other@example.com');
    ctx.remote.state.online = false;
    await ctx.store.refresh();
    expect(ctx.store.getState().circles).toEqual([]);
  });

  it('a server error is shown in plain words and leaves everything else alone', async () => {
    const ctx = setup();
    await ctx.signIn('a@example.com');
    ctx.store.start();
    ctx.remote.state.failNext = 2;
    await ctx.store.refresh();
    expect(ctx.store.getState()).toMatchObject({ status: 'error', error: 'Couldn’t load your Circles. Try again.' });
    await ctx.store.refresh();
    expect(ctx.store.getState().status).toBe('ready');
  });
});

describe('Circles: privacy boundary in the app code', () => {
  it('Circles code never reads the private profile', () => {
    const files = [
      ...readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
        .map((f) => join(__dirname, f)),
      ...readdirSync(join(__dirname, '..', '..', 'app', '(tabs)', 'circles')).map((f) => join(__dirname, '..', '..', 'app', '(tabs)', 'circles', f)),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect([file, /profiles|faithPreference|getProfile|\.profile\b|timezone/.test(text)]).toEqual([file, false]);
    }
    const supabase = readFileSync(join(__dirname, '..', '..', 'services', 'cloud', 'supabase-cloud.ts'), 'utf8');
    const circlesPart = supabase.split('function createCircles')[1].split('export function createSupabaseCloud')[0];
    expect(circlesPart).not.toMatch(/from\('profiles'\)/);
  });
});
