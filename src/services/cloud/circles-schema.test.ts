import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static checks of the Circles migration. The live behaviour (signed out,
 * non-member, member, owner, invites, rate limit, cascades) is checked by
 * supabase/tests/circles_rls_check.sql, which runs against real Postgres.
 */
const root = join(__dirname, '..', '..', '..');
const file = readdirSync(join(root, 'supabase', 'migrations')).find((f) => f.endsWith('_circles_foundation.sql'))!;
const raw = readFileSync(join(root, 'supabase', 'migrations', file), 'utf8');
/** The SQL without comments (so comments may explain things freely). */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .toLowerCase();
const fn = (name: string) => sql.split(`create function public.${name}(`)[1]?.split('$$;')[0] ?? '';

describe('Circles schema (Phase 5B)', () => {
  it('never touches the private profile (Faith preference, time zone, account name)', () => {
    expect(sql).not.toMatch(/profiles/);
    expect(sql).not.toMatch(/faith|timezone|email/);
  });

  it('keeps the shareable identity to an allow-list: user id, display name, timestamps', () => {
    const body = sql.split('create table public.circle_identities (')[1].split(');')[0];
    const columns = body
      .split('\n')
      .map((l) => l.trim().match(/^(\w+)\s+(uuid|text|timestamptz)/)?.[1])
      .filter(Boolean);
    expect(columns).toEqual(['user_id', 'display_name', 'created_at', 'updated_at']);
  });

  it('starts every Circles table with no privileges, and grants anonymous clients nothing', () => {
    expect(sql).toMatch(
      /revoke all on public\.circle_identities, public\.circles, public\.circle_members, public\.circle_invites, public\.circle_join_failures\s+from public, anon, authenticated/,
    );
    expect(sql).not.toMatch(/\bto (anon|public)\b(?!\.)/);
  });

  it('gives clients only narrow write paths (no direct insert of Circles, members or invites)', () => {
    expect(sql).toContain('grant select, insert (user_id, display_name), update (display_name) on public.circle_identities to authenticated');
    expect(sql).toContain('grant select, update (name), delete on public.circles to authenticated');
    expect(sql).toContain('grant select, delete on public.circle_members to authenticated');
    expect(sql).toContain('grant select on public.circle_invites to authenticated');
    expect(sql).not.toMatch(/grant [^;]*on public\.circle_join_failures/);
  });

  it('has the policies for members, owners and own identity', () => {
    expect(sql).toMatch(/on public\.circles for select to authenticated\s+using \(public\.is_circle_member\(id\)\)/);
    expect(sql).toMatch(/on public\.circle_members for select to authenticated\s+using \(public\.is_circle_member\(circle_id\)\)/);
    expect(sql).toMatch(/on public\.circle_members for delete to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id and role = 'member'\)/);
    expect(sql).toMatch(/on public\.circles for update to authenticated\s+using \(\(select auth\.uid\(\)\) = owner_user_id\)/);
    expect(sql).toMatch(/on public\.circles for delete to authenticated\s+using \(\(select auth\.uid\(\)\) = owner_user_id\)/);
    expect(sql).toMatch(/on public\.circle_identities for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id or public\.shares_circle_with\(user_id\)\)/);
    expect(sql).toMatch(/on public\.circle_identities for update to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
  });

  it('enforces membership rules in the database, not the app', () => {
    expect(sql).toMatch(/primary key \(circle_id, user_id\)/);
    expect(sql).toMatch(/create unique index circle_members_one_owner on public\.circle_members \(circle_id\) where role = 'owner'/);
    expect(sql).toMatch(/role text not null default 'member' check \(role in \('owner', 'member'\)\)/);
    expect(sql).toMatch(/circle_id uuid not null unique references public\.circles \(id\) on delete cascade/);
  });

  it('cascades every row on account deletion and on dissolving a Circle', () => {
    for (const table of ['circle_identities', 'circles', 'circle_members', 'circle_invites', 'circle_join_failures']) {
      const body = sql.split(`create table public.${table} (`)[1].split(');')[0];
      expect(body).toMatch(/references (auth\.users|public\.circles) \(id\) on delete cascade/);
    }
    expect(sql).toMatch(/owner_user_id uuid not null references auth\.users \(id\) on delete cascade/);
  });

  it('every function has an empty search_path, and every privileged one checks the caller', () => {
    const names = [...sql.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(names.length).toBe(12);
    for (const name of names) expect(fn(name)).toContain("set search_path = ''");
    for (const name of ['create_circle', 'preview_circle_invite', 'join_circle_by_code', 'new_circle_invite', 'set_circle_identity']) {
      expect(fn(name)).toContain('raise exception \'not signed in\'');
    }
    expect(fn('set_circle_identity')).toContain('security invoker');
    expect(fn('new_circle_invite')).toMatch(/owner_user_id = caller/);
  });

  it('internal helpers are not callable by clients', () => {
    const granted = sql.split('grant execute on function')[1].split('to authenticated')[0];
    for (const name of ['circles_new_invite_code', 'circles_issue_invite', 'circles_join_rate_limited', 'circles_normalise_invite_code']) {
      expect(granted).not.toContain(name);
    }
  });

  it('invite codes: 8 random characters (40 bits), expiring after 7 days, rate-limited guessing', () => {
    expect(sql).toContain("check (code ~ '^[0-9a-hjkmnp-tv-z]{8}$')");
    expect(fn('circles_new_invite_code')).toContain('gen_random_uuid()');
    expect(fn('circles_new_invite_code')).toContain('array[0, 1, 2, 3, 4, 5, 7, 9]'); // skips the fixed UUID version/variant bytes
    expect(fn('circles_issue_invite')).toContain("now() + interval '7 days'");
    expect(fn('preview_circle_invite')).toContain('i.expires_at > now()');
    expect(fn('join_circle_by_code')).toContain('i.expires_at > now()');
    expect(fn('circles_join_rate_limited')).toContain(">= 10");
    expect(fn('join_circle_by_code')).toContain('circles_join_rate_limited(caller)');
    expect(fn('preview_circle_invite')).toContain('circles_join_rate_limited(caller)');
  });

  it('the live verification script is read-only and was generated from this exact migration', () => {
    const verify = readFileSync(join(root, 'supabase', 'tests', 'circles_live_verify.sql'), 'utf8');
    const statements = verify
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
      .replace(/'[^']*'/g, "''") // quoted text such as privilege names isn't SQL
      .toLowerCase();
    expect(statements).not.toMatch(/\b(insert|update|delete|create|drop|alter|grant|revoke|truncate)\b/);
    const sha = createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex');
    expect(verify).toContain(`sha256 ${sha}`);
  });

  it('the preview reveals only the Circle name and whether you are already in it', () => {
    // Every quoted word in the function: the three keys, the status values and the "not signed in" error code. No member data.
    const words = new Set([...fn('preview_circle_invite').matchAll(/'(\w+)'/g)].map((m) => m[1]));
    expect(words).toEqual(new Set(['status', 'circle_name', 'already_member', 'valid', 'invalid', 'rate_limited', '42501']));
    expect(fn('preview_circle_invite')).not.toMatch(/display_name|circle_identities|count\(/);
  });
});
