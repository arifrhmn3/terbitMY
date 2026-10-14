import { describe, expect, it, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readCloudConfig } from './config';

// The Supabase client isn't needed to test error mapping.
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./auth-storage', () => ({ authStorage: {} }));
// eslint-disable-next-line import/first
import { createAuth, sessionStorageKey, storedSessionUser, toCloudError } from './supabase-cloud';
// eslint-disable-next-line import/first
import { friendlyAuthError } from '@/features/account/auth-messages';

const jwt = (payload: object) => `xxx.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

describe('cloud configuration', () => {
  it('is off (local-only) until both public values are set', () => {
    expect(readCloudConfig({})).toBeNull();
    expect(readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull();
    expect(
      readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' }),
    ).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_123' });
  });

  it('accepts a legacy anon key but refuses any secret / service-role key', () => {
    const url = 'https://abc.supabase.co';
    expect(readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }) })).not.toBeNull();
    expect(readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) })).toBeNull();
    expect(readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull();
    expect(readCloudConfig({ EXPO_PUBLIC_SUPABASE_URL: 'http://abc.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });

  it('no app code mentions the service-role key', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !path.endsWith(join('cloud', 'config.ts'))) {
          if (/service_role|SERVICE_ROLE|sb_secret_/.test(readFileSync(path, 'utf8'))) offenders.push(path);
        }
      }
    };
    walk(join(__dirname, '..', '..'));
    expect(offenders).toEqual([]);
  });
});

describe('cloud errors', () => {
  it('tells "offline" (retry later) apart from auth and server problems', () => {
    expect(toCloudError(new TypeError('Network request failed')).kind).toBe('offline');
    expect(toCloudError({ name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }).kind).toBe('offline');
    expect(toCloudError({ message: 'JWT expired', code: 'PGRST301' }).kind).toBe('auth');
    expect(toCloudError({ message: 'duplicate key value', code: '23505' }).kind).toBe('server');
  });
});

describe('session on the phone (Phase 5A)', () => {
  const saved = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'arif@example.com' } });
  const offline = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };
  type Listener = (event: string, session: { user: { id: string; email?: string } } | null) => void;
  const fakeAuth = (getSession: () => unknown) => {
    const listeners: Listener[] = [];
    const auth = {
      getSession: jest.fn(async () => getSession()),
      onAuthStateChange: jest.fn((l: Listener) => {
        listeners.push(l);
        return { data: { subscription: { unsubscribe: () => {} } } };
      }),
    };
    return { auth: auth as never, emit: (e: string, s: Parameters<Listener>[1]) => listeners.forEach((l) => l(e, s)) };
  };

  it('uses Supabase’s own default key, so existing sign-ins carry over', () => {
    expect(sessionStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
  });

  it('reads the signed-in user from a saved session; anything else is no user', () => {
    expect(storedSessionUser(saved)).toEqual({ id: 'u1', email: 'arif@example.com' });
    expect(storedSessionUser(null)).toBeNull();
    expect(storedSessionUser('{broken')).toBeNull();
    expect(storedSessionUser(JSON.stringify({ user: { id: 'u1' } }))).toBeNull(); // no refresh token: signed out
  });

  it('offline with an expired token: still signed in (from the saved session), not a guest', async () => {
    const { auth } = fakeAuth(() => ({ data: { session: null }, error: offline }));
    expect(await createAuth(auth, () => saved).currentUser()).toEqual({ id: 'u1', email: 'arif@example.com' });
  });

  it('a genuinely ended session (refresh rejected) is no user; a live session is the user', async () => {
    const ended = fakeAuth(() => ({ data: { session: null }, error: { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 } }));
    expect(await createAuth(ended.auth, () => saved).currentUser()).toBeNull();
    const live = fakeAuth(() => ({ data: { session: { user: { id: 'u2', email: 'x@example.com' } } }, error: null }));
    expect(await createAuth(live.auth, () => null).currentUser()).toEqual({ id: 'u2', email: 'x@example.com' });
  });

  it('only a real sign-out reports “no user”; the start-up event is ignored', () => {
    const { auth, emit } = fakeAuth(() => ({ data: { session: null }, error: null }));
    const events: unknown[] = [];
    createAuth(auth, () => null).onChange((e) => events.push(e.user));
    emit('INITIAL_SESSION', null); // offline at start-up: must not sign the user out
    emit('TOKEN_REFRESHED', { user: { id: 'u1', email: 'a@b.c' } });
    emit('SIGNED_OUT', null);
    expect(events).toEqual([{ id: 'u1', email: 'a@b.c' }, null]);
  });
});

describe('sign-in messages (plain words, no raw errors)', () => {
  const plain = (e: unknown, step: 'send' | 'verify') => friendlyAuthError(e, step).replace(/ \(.*\)$/, '');
  it('maps every failure to plain words', () => {
    expect(plain(new Error('Network request failed'), 'send')).toBe('You’re offline. Connect to the internet and try again.');
    expect(plain(new Error('email rate limit exceeded'), 'send')).toBe('Please wait a few minutes before asking for another code.');
    expect(plain(new Error('Email address "x@y.z" not authorized'), 'send')).toBe('This email address can’t receive sign-in codes yet.');
    expect(plain(new Error('Token has expired or is invalid'), 'verify')).toBe('That code didn’t work. Check it, or ask for a new one.');
    expect(plain(new Error('relation "x" does not exist'), 'send')).toBe('Couldn’t send the code. Try again in a moment.');
    expect(plain(new Error('500 internal'), 'verify')).toBe('Couldn’t sign in. Try again in a moment.');
  });
});

describe('no secrets in committed files', () => {
  it('.env.local stays ignored, and only public Supabase values exist in the app', () => {
    const root = join(__dirname, '..', '..', '..');
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toMatch(/^\.env\*\.local$/m);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', '.expo', 'dist', 'ios', 'android'].includes(entry.name) || entry.name.startsWith('.env')) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|json|sql|md)$/.test(entry.name)) {
          const text = readFileSync(path, 'utf8');
          // A real secret key, a JWT, or a service-role token, anywhere outside .env files.
          if (/sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/.test(text)) found.push(path);
        }
      }
    };
    walk(root);
    expect(found).toEqual([]);
  });
});

describe('Supabase schema (supabase/migrations)', () => {
  const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
    .toLowerCase();
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  /** The private backup tables (Phase 2B): own rows only. Circles tables have their own rules (circles-schema.test.ts). */
  const backupTables = tables.filter((t) => !t.startsWith('circle'));

  it('creates the expected private tables', () => {
    expect(backupTables.sort()).toEqual(['achievements', 'alarm_occurrences', 'alarms', 'profiles', 'xp_ledger']);
    expect(tables.filter((t) => t.startsWith('circle')).sort()).toEqual([
      'circle_identities',
      'circle_invites',
      'circle_join_failures',
      'circle_members',
      'circles',
    ]);
  });

  it('enables Row Level Security on every table, with own-rows-only policies for all four operations', () => {
    for (const table of tables) expect(sql).toContain(`alter table public.${table} enable row level security`);
    for (const table of backupTables) {
      const owner = table === 'profiles' ? 'id' : 'user_id';
      for (const op of ['select', 'insert', 'update', 'delete']) {
        const policy = new RegExp(`create policy "[^"]+" on public\\.${table} for ${op} to authenticated[^;]*\\(select auth\\.uid\\(\\)\\) = ${owner}`);
        expect(sql).toMatch(policy);
      }
    }
  });

  it('gives anonymous clients nothing and every user row cascades on account deletion', () => {
    expect(sql).toMatch(/revoke all on public\.profiles, public\.alarms, public\.alarm_occurrences, public\.xp_ledger, public\.achievements from anon/);
    expect(sql).not.toMatch(/grant [^;]* to anon/);
    for (const table of tables) {
      const body = sql.split(`create table public.${table} (`)[1].split(');')[0];
      expect(body).toMatch(/references auth\.users \(id\) on delete cascade/);
    }
  });

  it('sync functions run as the caller (RLS applies); only signup and account deletion are privileged', () => {
    const definers = [...sql.matchAll(/create function public\.(\w+)\([^)]*\)[^$]*?security definer/g)].map((m) => m[1]);
    expect(definers.sort()).toEqual([
      // Circles (Phase 5B): each checks auth.uid() itself (circles-schema.test.ts).
      'create_circle',
      'delete_my_account',
      'handle_new_user',
      'is_circle_member',
      'join_circle_by_code',
      'new_circle_invite',
      'preview_circle_invite',
      'shares_circle_with',
    ]);
    expect(sql).toMatch(/create function public\.sync_alarms\(items jsonb\)[\s\S]*?security invoker/);
    expect(sql).toMatch(/create function public\.sync_alarm_occurrences\(items jsonb\)[\s\S]*?security invoker/);
    // Newest wins on the server too.
    expect(sql).toContain('where a.updated_at <= excluded.updated_at');
    expect(sql).toContain('where o.updated_at <= excluded.updated_at');
  });
});
