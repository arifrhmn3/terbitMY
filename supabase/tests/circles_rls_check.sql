-- Terbit MY · Phase 5B · Circles security check (run in Supabase → SQL Editor).
--
-- Needs NO email and NO real accounts: it creates three throwaway test users
-- (owner, member, outsider) inside a transaction, acts as each of them exactly
-- like the app does (role "authenticated" + their user id), checks every
-- privacy and permission rule, and then ROLLS BACK, so nothing is kept.
--
-- Result: the last line says "All Circles security checks passed".
-- Any failed check stops the script with "ERROR: ... CHECK FAILED: <what>".
--
-- Run it after applying 20261013120000_circles_foundation.sql.

begin;

-- ── Setup (as the database owner) ────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'circles-check-owner@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'circles-check-member@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c3', 'circles-check-outsider@example.invalid');

-- PRIVATE profile data that must never be reachable through Circles.
insert into public.profiles (id, display_name, timezone, faith_preference) values
  ('00000000-0000-4000-8000-0000000000a1', 'PRIVATE-ACCOUNT-NAME', 'Asia/Kuala_Lumpur', 'islam'),
  ('00000000-0000-4000-8000-0000000000b2', 'PRIVATE-ACCOUNT-NAME', 'Asia/Kuala_Lumpur', 'christianity'),
  ('00000000-0000-4000-8000-0000000000c3', 'PRIVATE-ACCOUNT-NAME', 'Asia/Kuala_Lumpur', 'buddhism')
on conflict (id) do update set
  display_name = excluded.display_name, timezone = excluded.timezone, faith_preference = excluded.faith_preference;

-- ── 1. Signed out (anon): nothing at all ─────────────────────────────────────

set local role anon;
do $$
begin
  begin perform 1 from public.circles; raise exception 'CHECK FAILED: anon read circles';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.circle_members; raise exception 'CHECK FAILED: anon read members';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.circle_identities; raise exception 'CHECK FAILED: anon read identities';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.circle_invites; raise exception 'CHECK FAILED: anon read invites';
  exception when insufficient_privilege then null; end;
  begin perform public.join_circle_by_code('ABCDEFGH'); raise exception 'CHECK FAILED: anon called join';
  exception when insufficient_privilege then null; end;
  begin perform public.preview_circle_invite('ABCDEFGH'); raise exception 'CHECK FAILED: anon called preview';
  exception when insufficient_privilege then null; end;
  begin perform public.create_circle('x'); raise exception 'CHECK FAILED: anon called create';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── 2. Owner: display name, create, invite ───────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.create_circle('Morning Crew');
  assert r->>'status' = 'needs_name', 'CHECK FAILED: create without a display name must ask for one';

  r := public.set_circle_identity('   ');
  assert r->>'status' = 'invalid_name', 'CHECK FAILED: blank display name accepted';
  r := public.set_circle_identity('  Same Name  ');
  assert r->>'status' = 'saved' and r->>'display_name' = 'Same Name', 'CHECK FAILED: owner display name';

  r := public.create_circle('   ');
  assert r->>'status' = 'invalid_name', 'CHECK FAILED: blank Circle name accepted';
  r := public.create_circle(repeat('x', 41));
  assert r->>'status' = 'invalid_name', 'CHECK FAILED: 41-character Circle name accepted';

  r := public.create_circle('  Morning Crew  ');
  assert r->>'status' = 'created', 'CHECK FAILED: create Circle';
  assert r->>'invite_code' ~ '^[0-9A-HJKMNP-TV-Z]{8}$', 'CHECK FAILED: invite code format';
  perform set_config('check.circle', r->>'circle_id', true);
  perform set_config('check.code', r->>'invite_code', true);

  assert (select name from public.circles where id = (r->>'circle_id')::uuid) = 'Morning Crew', 'CHECK FAILED: name not trimmed';
  assert (select count(*) from public.circle_members where circle_id = (r->>'circle_id')::uuid) = 1, 'CHECK FAILED: creator membership count';
  assert (select role from public.circle_members where circle_id = (r->>'circle_id')::uuid
           and user_id = '00000000-0000-4000-8000-0000000000a1') = 'owner', 'CHECK FAILED: creator is not owner';
  assert (select code from public.circle_invites where circle_id = (r->>'circle_id')::uuid) = r->>'invite_code',
    'CHECK FAILED: owner cannot see the invite';

  -- A second Circle with the SAME name is fine (no uniqueness).
  r := public.create_circle('Morning Crew');
  assert r->>'status' = 'created', 'CHECK FAILED: duplicate Circle names must be allowed';
  perform set_config('check.circle2', r->>'circle_id', true);
  perform set_config('check.code2', r->>'invite_code', true);
  assert (select count(*) from public.circles) = 2, 'CHECK FAILED: owner should see 2 Circles';

  -- Owner can rename.
  update public.circles set name = 'Morning Crew 2' where id = current_setting('check.circle2')::uuid;
  assert (select name from public.circles where id = current_setting('check.circle2')::uuid) = 'Morning Crew 2', 'CHECK FAILED: rename';

  -- Owner can't change who owns it, or insert members/invites directly.
  begin update public.circles set owner_user_id = '00000000-0000-4000-8000-0000000000c3'; raise exception 'CHECK FAILED: owner_user_id writable';
  exception when insufficient_privilege then null; end;
  begin insert into public.circle_members (circle_id, user_id) values (current_setting('check.circle')::uuid, '00000000-0000-4000-8000-0000000000c3');
    raise exception 'CHECK FAILED: direct member insert';
  exception when insufficient_privilege then null; end;
  begin insert into public.circle_invites (code, circle_id, created_by, expires_at)
    values ('AAAAAAAA', current_setting('check.circle')::uuid, '00000000-0000-4000-8000-0000000000a1', now() + interval '1 year');
    raise exception 'CHECK FAILED: direct invite insert (chosen code)';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The second Circle's code is expired (as the database owner).
update public.circle_invites set expires_at = now() - interval '1 minute' where circle_id = current_setting('check.circle2')::uuid;

-- ── 3. Signed-in non-member: sees nothing ────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  assert (select count(*) from public.circles) = 0, 'CHECK FAILED: non-member sees Circles';
  assert (select count(*) from public.circle_members) = 0, 'CHECK FAILED: non-member sees memberships';
  assert (select count(*) from public.circle_invites) = 0, 'CHECK FAILED: non-member sees invites';
  assert (select count(*) from public.circle_identities where user_id <> '00000000-0000-4000-8000-0000000000c3') = 0,
    'CHECK FAILED: non-member sees other identities (no directory)';
  assert (select count(*) from public.profiles where id <> '00000000-0000-4000-8000-0000000000c3') = 0,
    'CHECK FAILED: private profiles of others readable';
  assert not public.is_circle_member(current_setting('check.circle')::uuid), 'CHECK FAILED: is_circle_member';

  update public.circles set name = 'Hacked' where id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: non-member renamed a Circle';
  delete from public.circles where id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: non-member dissolved a Circle';
  delete from public.circle_members where circle_id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: non-member removed members';
  assert public.new_circle_invite(current_setting('check.circle')::uuid)->>'status' = 'not_owner', 'CHECK FAILED: non-owner new invite';

  begin perform 1 from public.circle_join_failures; raise exception 'CHECK FAILED: join failures readable';
  exception when insufficient_privilege then null; end;

  -- An expired code fails safely.
  assert public.preview_circle_invite(current_setting('check.code2'))->>'status' = 'invalid', 'CHECK FAILED: expired code accepted';
end $$;
reset role;

-- ── 4. Member: join by code ──────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r jsonb;
  code text := current_setting('check.code');
  messy text := lower(substr(code, 1, 4) || '-' || substr(code, 5, 4)); -- typed as "abcd-efgh"
  n int;
begin
  r := public.preview_circle_invite(messy);
  assert r->>'status' = 'valid' and r->>'circle_name' = 'Morning Crew' and (r->>'already_member')::boolean = false,
    'CHECK FAILED: preview';
  assert (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['already_member', 'circle_name', 'status'],
    'CHECK FAILED: preview reveals more than the Circle name';
  -- Previewing does not grant access.
  assert (select count(*) from public.circles) = 0, 'CHECK FAILED: preview granted access';

  r := public.join_circle_by_code(code);
  assert r->>'status' = 'needs_name', 'CHECK FAILED: join without a display name must ask for one';

  -- Duplicate display names are allowed.
  assert public.set_circle_identity('Same Name')->>'status' = 'saved', 'CHECK FAILED: duplicate display name';

  r := public.join_circle_by_code(messy);
  assert r->>'status' = 'joined' and r->>'circle_name' = 'Morning Crew', 'CHECK FAILED: join';
  r := public.join_circle_by_code(code);
  assert r->>'status' = 'already_member', 'CHECK FAILED: second join must be already_member';
  assert (select count(*) from public.circle_members where circle_id = current_setting('check.circle')::uuid) = 2,
    'CHECK FAILED: member count after joining twice';

  -- The member sees this Circle (not the owner's other one), both members, and their Circle names only.
  assert (select count(*) from public.circles) = 1, 'CHECK FAILED: member sees Circles they are not in';
  assert (select count(*) from public.circle_identities) = 2, 'CHECK FAILED: member identity visibility';
  assert (select display_name from public.circle_identities where user_id = '00000000-0000-4000-8000-0000000000a1') = 'Same Name',
    'CHECK FAILED: member cannot see owner display name';
  -- ...but never the owner's private profile (Faith preference, time zone, account name).
  assert (select count(*) from public.profiles where id <> '00000000-0000-4000-8000-0000000000b2') = 0,
    'CHECK FAILED: member can read the owner private profile';

  -- Member can't do owner things.
  assert (select count(*) from public.circle_invites) = 0, 'CHECK FAILED: member sees invite';
  assert public.new_circle_invite(current_setting('check.circle')::uuid)->>'status' = 'not_owner', 'CHECK FAILED: member new invite';
  update public.circles set name = 'Hacked' where id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: member renamed';
  delete from public.circles where id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: member dissolved';
  delete from public.circle_members where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: member removed the owner';
  update public.circle_identities set display_name = 'Hacked' where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: member edited another identity';
  begin update public.circle_members set role = 'owner'; raise exception 'CHECK FAILED: role writable';
  exception when insufficient_privilege then null; end;
  begin insert into public.circle_identities (user_id, display_name) values ('00000000-0000-4000-8000-0000000000c3', 'Fake');
    raise exception 'CHECK FAILED: identity insert for someone else';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── 5. Invite rotation, brute force (outsider) ───────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.new_circle_invite(current_setting('check.circle')::uuid);
  assert r->>'status' = 'ok' and r->>'invite_code' <> current_setting('check.code'), 'CHECK FAILED: new invite';
  assert (select count(*) from public.circle_invites where circle_id = current_setting('check.circle')::uuid) = 1,
    'CHECK FAILED: more than one code per Circle';
  perform set_config('check.code', r->>'invite_code', true);
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  -- Wrong codes are refused (1 expired attempt above + 9 here), then the
  -- 10-per-15-minutes limit applies, even to a right code.
  perform public.set_circle_identity('Outsider');
  for i in 1..9 loop
    r := public.join_circle_by_code('ZZZZZZZ' || i % 10);
    assert r->>'status' = 'invalid', 'CHECK FAILED: wrong code ' || i || ' → ' || r::text;
  end loop;
  assert public.join_circle_by_code(current_setting('check.code'))->>'status' = 'rate_limited', 'CHECK FAILED: no rate limit';
  assert public.preview_circle_invite(current_setting('check.code'))->>'status' = 'rate_limited', 'CHECK FAILED: preview not rate-limited';
  assert (select count(*) from public.circles) = 0, 'CHECK FAILED: outsider got in';
end $$;
reset role;

-- ── 6. Leave ─────────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  -- The owner can't leave (dissolve instead).
  delete from public.circle_members where circle_id = current_setting('check.circle')::uuid and user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'CHECK FAILED: owner left their own Circle';
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  delete from public.circle_members where circle_id = current_setting('check.circle')::uuid and user_id = '00000000-0000-4000-8000-0000000000b2';
  get diagnostics n = row_count;
  assert n = 1, 'CHECK FAILED: member could not leave';
  assert (select count(*) from public.circles) = 0, 'CHECK FAILED: Circle still listed after leaving';
  assert (select count(*) from public.circle_identities where user_id <> '00000000-0000-4000-8000-0000000000b2') = 0,
    'CHECK FAILED: still sees former co-member identities';
end $$;
reset role;

-- ── 7. Database rules (as the database owner) ────────────────────────────────

do $$
begin
  assert (select count(*) from public.circle_members where circle_id = current_setting('check.circle')::uuid) = 1,
    'CHECK FAILED: owner affected by member leaving';
  begin
    insert into public.circle_members (circle_id, user_id, role)
    values (current_setting('check.circle')::uuid, '00000000-0000-4000-8000-0000000000a1', 'member');
    raise exception 'CHECK FAILED: duplicate membership allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.circle_members (circle_id, user_id, role)
    values (current_setting('check.circle')::uuid, '00000000-0000-4000-8000-0000000000b2', 'owner');
    raise exception 'CHECK FAILED: second owner allowed';
  exception when unique_violation then null; end;

  -- Shareable identity holds a display name and nothing else.
  assert (select array_agg(column_name::text order by column_name::text) from information_schema.columns
           where table_schema = 'public' and table_name = 'circle_identities')
         = array['created_at', 'display_name', 'updated_at', 'user_id'], 'CHECK FAILED: identity has extra columns';

  -- Faith privacy: no Circles function or policy touches the private profile.
  assert not exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
       and (p.proname like '%circle%')
       and p.prosrc ilike '%profiles%'
  ), 'CHECK FAILED: a Circles function reads profiles';
  assert not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename like 'circle%'
       and (coalesce(qual, '') ilike '%profiles%' or coalesce(with_check, '') ilike '%profiles%')
  ), 'CHECK FAILED: a Circles policy reads profiles';
end $$;

-- ── 8. Dissolve, then account deletion ───────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  delete from public.circles where id = current_setting('check.circle')::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'CHECK FAILED: owner could not dissolve';
end $$;
reset role;

do $$
begin
  assert (select count(*) from public.circle_members where circle_id = current_setting('check.circle')::uuid) = 0, 'CHECK FAILED: members left behind';
  assert (select count(*) from public.circle_invites where circle_id = current_setting('check.circle')::uuid) = 0, 'CHECK FAILED: invite left behind';
  assert (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000a1') = 1, 'CHECK FAILED: dissolve touched the profile';

  -- Deleting the owner's account dissolves the Circles they own and removes their identity.
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
  assert (select count(*) from public.circles where id = current_setting('check.circle2')::uuid) = 0, 'CHECK FAILED: owned Circle kept after account deletion';
  assert (select count(*) from public.circle_identities where user_id = '00000000-0000-4000-8000-0000000000a1') = 0, 'CHECK FAILED: identity kept';
  assert (select count(*) from public.circle_identities where user_id = '00000000-0000-4000-8000-0000000000b2') = 1, 'CHECK FAILED: other identity removed';
  assert (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000b2') = 1, 'CHECK FAILED: other profile removed';
end $$;

select 'All Circles security checks passed' as result;

rollback;
