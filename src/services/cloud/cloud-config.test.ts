import { describe, expect, it, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readCloudConfig } from './config';

// The Supabase client isn't needed to test error mapping.
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./auth-storage', () => ({ authStorage: {} }));
// eslint-disable-next-line import/first
import { toCloudError } from './supabase-cloud';

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

describe('Supabase schema (supabase/migrations)', () => {
  const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
    .toLowerCase();
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

  it('creates the expected private tables', () => {
    expect(tables.sort()).toEqual(['achievements', 'alarm_occurrences', 'alarms', 'profiles', 'xp_ledger']);
  });

  it('enables Row Level Security on every table, with own-rows-only policies for all four operations', () => {
    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
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
    expect(definers.sort()).toEqual(['delete_my_account', 'handle_new_user']);
    expect(sql).toMatch(/create function public\.sync_alarms\(items jsonb\)[\s\S]*?security invoker/);
    expect(sql).toMatch(/create function public\.sync_alarm_occurrences\(items jsonb\)[\s\S]*?security invoker/);
    // Newest wins on the server too.
    expect(sql).toContain('where a.updated_at <= excluded.updated_at');
    expect(sql).toContain('where o.updated_at <= excluded.updated_at');
  });
});
