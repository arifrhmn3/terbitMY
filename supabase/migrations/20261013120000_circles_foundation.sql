-- Terbit MY · Phase 5B · Circles Foundation
--
-- Private, invite-only accountability groups. Membership infrastructure ONLY:
-- no feed, check-ins, reactions or activity sharing (Phases 5C/5D).
--
-- Privacy rules (see docs/CLOUD.md → Circles):
-- 1. Circles never read the PRIVATE account profile (faith preference, time
--    zone, account display name). Other members only ever see the separate,
--    allow-listed `circle_identities` row: a display name, nothing else.
-- 2. Nothing is readable by anonymous clients. A signed-in user sees only
--    Circles they belong to, the members of those Circles, and those
--    members' Circle display names. There is no directory or discovery.
-- 3. Tables are written only through narrow paths: the functions below
--    (create, join, invite) or owner/self-only RLS (rename, dissolve, leave,
--    own display name). Clients have no INSERT on circles, members or invites.
-- 4. Every row cascades when its account is deleted. Circles a user OWNS are
--    dissolved with the account (members and invites go too).

-- ── Shareable Circle identity (separate from the private profile) ───────────

create table public.circle_identities (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (
    char_length(display_name) between 1 and 40
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.circle_identities is
  'SHAREABLE. Allow-listed Circle identity (display name only). Readable by the user and by members of Circles they share. Never add private fields here.';

-- ── Circles ──────────────────────────────────────────────────────────────────

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  -- Not unique: many Circles may be called "Family".
  name text not null check (
    char_length(name) between 1 and 40
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
  ),
  -- Account deletion dissolves the Circles the user owns.
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index circles_owner_idx on public.circles (owner_user_id);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  -- One membership per person per Circle, enforced by the database.
  primary key (circle_id, user_id)
);

create index circle_members_user_idx on public.circle_members (user_id);
-- Exactly one owner row per Circle (created together with the Circle).
create unique index circle_members_one_owner on public.circle_members (circle_id) where role = 'owner';

-- ── Invites: one current code per Circle ─────────────────────────────────────

create table public.circle_invites (
  -- 8 random Crockford base32 characters (40 bits), never derived from the Circle id.
  code text primary key check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  circle_id uuid not null unique references public.circles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Failed code attempts, for basic brute-force protection. No client access.
create table public.circle_join_failures (
  user_id uuid not null references auth.users (id) on delete cascade,
  failed_at timestamptz not null default now()
);

create index circle_join_failures_user_idx on public.circle_join_failures (user_id, failed_at);

-- ── updated_at ───────────────────────────────────────────────────────────────

create function public.circles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger circle_identities_touch before update on public.circle_identities
  for each row execute function public.circles_touch_updated_at();
create trigger circles_touch before update on public.circles
  for each row execute function public.circles_touch_updated_at();

-- ── Membership helpers for RLS ───────────────────────────────────────────────
-- SECURITY DEFINER so the policies can look at circle_members without
-- recursing into its own policy. They only answer yes/no about the CALLER.

create function public.is_circle_member(target_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.circle_members m
     where m.circle_id = target_circle and m.user_id = (select auth.uid())
  );
$$;

create function public.shares_circle_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.circle_members mine
      join public.circle_members theirs on theirs.circle_id = mine.circle_id
     where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.circle_identities enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invites enable row level security;
alter table public.circle_join_failures enable row level security;

-- Identity: your own, plus people you share a Circle with. Edit your own only.
create policy "circle_identities: read own or co-member" on public.circle_identities for select to authenticated
  using ((select auth.uid()) = user_id or public.shares_circle_with(user_id));
create policy "circle_identities: insert own" on public.circle_identities for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "circle_identities: update own" on public.circle_identities for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Circles: members read; the owner renames or dissolves.
create policy "circles: members read" on public.circles for select to authenticated
  using (public.is_circle_member(id));
create policy "circles: owner renames" on public.circles for update to authenticated
  using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "circles: owner dissolves" on public.circles for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

-- Members: members read the member list; a member (never the owner) can leave.
create policy "circle_members: members read" on public.circle_members for select to authenticated
  using (public.is_circle_member(circle_id));
create policy "circle_members: member leaves" on public.circle_members for delete to authenticated
  using ((select auth.uid()) = user_id and role = 'member');

-- Invites: only the Circle's owner sees the code.
create policy "circle_invites: owner reads" on public.circle_invites for select to authenticated
  using (exists (
    select 1 from public.circles c where c.id = circle_id and c.owner_user_id = (select auth.uid())
  ));

-- circle_join_failures: RLS on and no policies, so no client can read or write it.

-- Privileges: start from nothing, then allow exactly what the policies cover.
revoke all on public.circle_identities, public.circles, public.circle_members, public.circle_invites, public.circle_join_failures
  from public, anon, authenticated;
grant select, insert (user_id, display_name), update (display_name) on public.circle_identities to authenticated;
grant select, update (name), delete on public.circles to authenticated;
grant select, delete on public.circle_members to authenticated;
grant select on public.circle_invites to authenticated;

-- ── Internal helpers (not callable by clients) ───────────────────────────────

-- 8 characters from gen_random_uuid()'s strongly random bytes. 32 divides 256,
-- so every character is equally likely. Bytes 6 and 8 hold fixed UUID bits and
-- are skipped.
create function public.circles_new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea := uuid_send(gen_random_uuid());
  position_index int;
  result text := '';
begin
  foreach position_index in array array[0, 1, 2, 3, 4, 5, 7, 9] loop
    result := result || substr(alphabet, (get_byte(random_bytes, position_index) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- Accepts "abcd-efgh", spaces, and the look-alikes O → 0, I/L → 1.
create function public.circles_normalise_invite_code(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(raw, ''), '[[:space:]-]', '', 'g')), 'OIL', '011');
$$;

-- Replaces the Circle's code with a fresh one, valid for 7 days.
create function public.circles_issue_invite(target_circle uuid, issuer uuid)
returns public.circle_invites
language plpgsql
volatile
set search_path = ''
as $$
declare
  invite public.circle_invites;
begin
  delete from public.circle_invites where circle_id = target_circle;
  for attempt in 1..5 loop
    begin
      insert into public.circle_invites (code, circle_id, created_by, expires_at)
      values (public.circles_new_invite_code(), target_circle, issuer, now() + interval '7 days')
      returning * into invite;
      return invite;
    exception when unique_violation then
      -- Another Circle already has this code (very unlikely): draw again.
    end;
  end loop;
  raise exception 'Could not create an invite code';
end;
$$;

-- At most 10 wrong codes per user in 15 minutes.
create function public.circles_join_rate_limited(caller uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  delete from public.circle_join_failures where user_id = caller and failed_at < now() - interval '1 day';
  return (
    select count(*) from public.circle_join_failures
     where user_id = caller and failed_at > now() - interval '15 minutes'
  ) >= 10;
end;
$$;

-- ── Client functions ─────────────────────────────────────────────────────────
-- SECURITY DEFINER because joining must look up a code the caller can't read,
-- and creating must add the Circle, the owner row and the invite together.
-- Each one checks auth.uid() itself, uses an empty search_path, and returns
-- only what the caller is allowed to know. Expected outcomes are returned as
-- a status (so a wrong code is still recorded), not raised as errors.

create function public.set_circle_identity(new_display_name text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := btrim(new_display_name);
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if clean is null or char_length(clean) not between 1 and 40 or clean ~ '[[:cntrl:]]' then
    return jsonb_build_object('status', 'invalid_name');
  end if;
  insert into public.circle_identities (user_id, display_name)
  values (caller, clean)
  on conflict (user_id) do update set display_name = excluded.display_name;
  return jsonb_build_object('status', 'saved', 'display_name', clean);
end;
$$;

create function public.create_circle(circle_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := btrim(circle_name);
  new_circle uuid;
  invite public.circle_invites;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.circle_identities where user_id = caller) then
    return jsonb_build_object('status', 'needs_name');
  end if;
  if clean is null or char_length(clean) not between 1 and 40 or clean ~ '[[:cntrl:]]' then
    return jsonb_build_object('status', 'invalid_name');
  end if;
  if (select count(*) from public.circles where owner_user_id = caller) >= 20 then
    return jsonb_build_object('status', 'limit_reached');
  end if;

  insert into public.circles (name, owner_user_id) values (clean, caller) returning id into new_circle;
  -- The creator is the owner AND a member: one row, role 'owner'.
  insert into public.circle_members (circle_id, user_id, role) values (new_circle, caller, 'owner');
  invite := public.circles_issue_invite(new_circle, caller);

  return jsonb_build_object(
    'status', 'created',
    'circle_id', new_circle,
    'invite_code', invite.code,
    'invite_expires_at', invite.expires_at
  );
end;
$$;

-- Shows the Circle's name before joining. Nothing else (no members).
create function public.preview_circle_invite(invite_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := public.circles_normalise_invite_code(invite_code);
  found_circle uuid;
  found_name text;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if public.circles_join_rate_limited(caller) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select c.id, c.name into found_circle, found_name
    from public.circle_invites i
    join public.circles c on c.id = i.circle_id
   where i.code = clean and i.expires_at > now();

  if found_circle is null then
    insert into public.circle_join_failures (user_id) values (caller);
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', 'valid',
    'circle_name', found_name,
    'already_member', exists (
      select 1 from public.circle_members where circle_id = found_circle and user_id = caller
    )
  );
end;
$$;

create function public.join_circle_by_code(invite_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean text := public.circles_normalise_invite_code(invite_code);
  found_circle uuid;
  found_name text;
  inserted int;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if public.circles_join_rate_limited(caller) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not exists (select 1 from public.circle_identities where user_id = caller) then
    return jsonb_build_object('status', 'needs_name');
  end if;

  -- Lock the Circle so the member limit holds when several people join at once.
  select c.id, c.name into found_circle, found_name
    from public.circle_invites i
    join public.circles c on c.id = i.circle_id
   where i.code = clean and i.expires_at > now()
     for update of c;

  if found_circle is null then
    insert into public.circle_join_failures (user_id) values (caller);
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (select 1 from public.circle_members where circle_id = found_circle and user_id = caller) then
    return jsonb_build_object('status', 'already_member', 'circle_id', found_circle, 'circle_name', found_name);
  end if;

  if (select count(*) from public.circle_members where circle_id = found_circle) >= 50 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (found_circle, caller, 'member')
  on conflict (circle_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  return jsonb_build_object(
    'status', case when inserted = 1 then 'joined' else 'already_member' end,
    'circle_id', found_circle,
    'circle_name', found_name
  );
end;
$$;

-- Owner only: replaces the code (the old one stops working at once).
create function public.new_circle_invite(target_circle uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  invite public.circle_invites;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.circles where id = target_circle and owner_user_id = caller) then
    return jsonb_build_object('status', 'not_owner');
  end if;
  invite := public.circles_issue_invite(target_circle, caller);
  return jsonb_build_object('status', 'ok', 'invite_code', invite.code, 'invite_expires_at', invite.expires_at);
end;
$$;

-- Function privileges: clients may call only the five client functions and
-- the two RLS helpers; internal helpers are private to the functions above.
revoke all on function
  public.circles_touch_updated_at(),
  public.is_circle_member(uuid),
  public.shares_circle_with(uuid),
  public.circles_new_invite_code(),
  public.circles_normalise_invite_code(text),
  public.circles_issue_invite(uuid, uuid),
  public.circles_join_rate_limited(uuid),
  public.set_circle_identity(text),
  public.create_circle(text),
  public.preview_circle_invite(text),
  public.join_circle_by_code(text),
  public.new_circle_invite(uuid)
  from public, anon, authenticated;

grant execute on function
  public.is_circle_member(uuid),
  public.shares_circle_with(uuid),
  public.set_circle_identity(text),
  public.create_circle(text),
  public.preview_circle_invite(text),
  public.join_circle_by_code(text),
  public.new_circle_invite(uuid)
  to authenticated;

-- ── Rollback (manual; deletes every Circle) ──────────────────────────────────
-- drop function public.new_circle_invite(uuid), public.join_circle_by_code(text),
--   public.preview_circle_invite(text), public.create_circle(text), public.set_circle_identity(text),
--   public.circles_join_rate_limited(uuid), public.circles_issue_invite(uuid, uuid),
--   public.circles_normalise_invite_code(text), public.circles_new_invite_code();
-- drop table public.circle_join_failures, public.circle_invites, public.circle_members,
--   public.circles, public.circle_identities;
-- drop function public.shares_circle_with(uuid), public.is_circle_member(uuid), public.circles_touch_updated_at();
