-- Terbit MY · Phase 2B · Accounts & Cloud Foundation
--
-- Cloud BACKUP of the phone's canonical records. The phone (SQLite) stays the
-- source of truth for anything alarm-time; nothing here is needed for an
-- alarm to ring or a mission to count.
--
-- Privacy: every table is private. Row Level Security limits each user to
-- their own rows; nothing is readable by other users or by anonymous
-- clients. Future social features must add explicit, opt-in sharing.
--
-- Times from the phone are kept as bigint milliseconds since 1970 (exactly as
-- stored locally), so comparisons for conflict resolution are exact.
-- Derived values (streaks, totals, ranks) are NOT stored: they are
-- recalculated from these records.

-- ── Profiles ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 50),
  avatar_url text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A profile row for every new account (the app also upserts it, so this is a safety net).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Alarms (editable: newest updated_at wins) ────────────────────────────────

create table public.alarms (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  hour smallint not null check (hour between 0 and 23),
  minute smallint not null check (minute between 0 and 59),
  weekdays jsonb not null default '[]',
  enabled boolean not null,
  label text not null default '',
  mission jsonb not null,
  snooze jsonb not null,
  is_main_wake_up boolean not null default false,
  completion_mode text not null check (completion_mode in ('reward', 'gentle', 'challenge')),
  gentle_reminder_minutes smallint not null,
  sound_id text not null,
  created_at bigint not null,
  updated_at bigint not null,
  -- Deleted on the phone: kept as a tombstone so other devices learn about it.
  deleted_at bigint,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── Alarm occurrences (events; settle into a final state) ────────────────────

create table public.alarm_occurrences (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  alarm_id text not null,
  scheduled_at bigint not null,
  source text not null,
  status text not null,
  alarm_label text not null default '',
  was_main_wake_up boolean not null,
  mission jsonb not null,
  snooze_minutes smallint,
  completion_mode text not null check (completion_mode in ('reward', 'gentle', 'challenge')),
  gentle_reminder_minutes smallint not null,
  fire_evidence text not null,
  started_at bigint,
  alarm_stopped_at bigint,
  alarm_stop_reason text,
  mission_started_at bigint,
  mission_completed_at bigint,
  ended_at bigint,
  result jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id),
  -- Same duplicate protection as the phone: one occurrence per alarm event.
  unique (user_id, alarm_id, scheduled_at)
);

-- ── XP ledger (immutable; insert once) ───────────────────────────────────────

create table public.xp_ledger (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  award_key text not null,
  occurrence_id text,
  category text check (category is null or category in ('education', 'fitness', 'faith')),
  amount integer not null,
  reason text not null,
  earned_at bigint not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, award_key)
);

-- ── Achievements (immutable; insert once) ────────────────────────────────────

create table public.achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  unlocked_at bigint not null,
  occurrence_id text,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── Row Level Security: own rows only ────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.alarms enable row level security;
alter table public.alarm_occurrences enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.achievements enable row level security;

create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "alarms: read own" on public.alarms for select to authenticated using ((select auth.uid()) = user_id);
create policy "alarms: insert own" on public.alarms for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alarms: update own" on public.alarms for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "alarms: delete own" on public.alarms for delete to authenticated using ((select auth.uid()) = user_id);

create policy "alarm_occurrences: read own" on public.alarm_occurrences for select to authenticated using ((select auth.uid()) = user_id);
create policy "alarm_occurrences: insert own" on public.alarm_occurrences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alarm_occurrences: update own" on public.alarm_occurrences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "alarm_occurrences: delete own" on public.alarm_occurrences for delete to authenticated using ((select auth.uid()) = user_id);

create policy "xp_ledger: read own" on public.xp_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "xp_ledger: insert own" on public.xp_ledger for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "xp_ledger: update own" on public.xp_ledger for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "xp_ledger: delete own" on public.xp_ledger for delete to authenticated using ((select auth.uid()) = user_id);

create policy "achievements: read own" on public.achievements for select to authenticated using ((select auth.uid()) = user_id);
create policy "achievements: insert own" on public.achievements for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "achievements: update own" on public.achievements for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "achievements: delete own" on public.achievements for delete to authenticated using ((select auth.uid()) = user_id);

-- Signed-in users only; anonymous clients get nothing.
revoke all on public.profiles, public.alarms, public.alarm_occurrences, public.xp_ledger, public.achievements from anon;
grant select, insert, update, delete on public.profiles, public.alarms, public.alarm_occurrences, public.xp_ledger, public.achievements to authenticated;

-- ── Sync functions (run as the caller, so RLS still applies) ─────────────────

-- Alarms: insert, or update only if the incoming copy is at least as new.
create function public.sync_alarms(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.alarms as a (
    user_id, id, hour, minute, weekdays, enabled, label, mission, snooze, is_main_wake_up,
    completion_mode, gentle_reminder_minutes, sound_id, created_at, updated_at, deleted_at, synced_at
  )
  select (select auth.uid()), x.id, x.hour, x.minute, x.weekdays, x.enabled, x.label, x.mission, x.snooze,
         x.is_main_wake_up, x.completion_mode, x.gentle_reminder_minutes, x.sound_id, x.created_at, x.updated_at,
         null, now()
    from jsonb_to_recordset(items) as x(
      id text, hour smallint, minute smallint, weekdays jsonb, enabled boolean, label text, mission jsonb,
      snooze jsonb, is_main_wake_up boolean, completion_mode text, gentle_reminder_minutes smallint,
      sound_id text, created_at bigint, updated_at bigint
    )
  on conflict (user_id, id) do update set
    hour = excluded.hour, minute = excluded.minute, weekdays = excluded.weekdays, enabled = excluded.enabled,
    label = excluded.label, mission = excluded.mission, snooze = excluded.snooze,
    is_main_wake_up = excluded.is_main_wake_up, completion_mode = excluded.completion_mode,
    gentle_reminder_minutes = excluded.gentle_reminder_minutes, sound_id = excluded.sound_id,
    updated_at = excluded.updated_at, deleted_at = null, synced_at = now()
  where a.updated_at <= excluded.updated_at;
$$;

-- Occurrences: insert, or update only if the incoming copy is at least as new.
create function public.sync_alarm_occurrences(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.alarm_occurrences as o (
    user_id, id, alarm_id, scheduled_at, source, status, alarm_label, was_main_wake_up, mission, snooze_minutes,
    completion_mode, gentle_reminder_minutes, fire_evidence, started_at, alarm_stopped_at, alarm_stop_reason,
    mission_started_at, mission_completed_at, ended_at, result, created_at, updated_at, synced_at
  )
  select (select auth.uid()), x.id, x.alarm_id, x.scheduled_at, x.source, x.status, x.alarm_label,
         x.was_main_wake_up, x.mission, x.snooze_minutes, x.completion_mode, x.gentle_reminder_minutes,
         x.fire_evidence, x.started_at, x.alarm_stopped_at, x.alarm_stop_reason, x.mission_started_at,
         x.mission_completed_at, x.ended_at, x.result, x.created_at, x.updated_at, now()
    from jsonb_to_recordset(items) as x(
      id text, alarm_id text, scheduled_at bigint, source text, status text, alarm_label text,
      was_main_wake_up boolean, mission jsonb, snooze_minutes smallint, completion_mode text,
      gentle_reminder_minutes smallint, fire_evidence text, started_at bigint, alarm_stopped_at bigint,
      alarm_stop_reason text, mission_started_at bigint, mission_completed_at bigint, ended_at bigint,
      result jsonb, created_at bigint, updated_at bigint
    )
  on conflict (user_id, id) do update set
    status = excluded.status, started_at = excluded.started_at, alarm_stopped_at = excluded.alarm_stopped_at,
    alarm_stop_reason = excluded.alarm_stop_reason, mission_started_at = excluded.mission_started_at,
    mission_completed_at = excluded.mission_completed_at, ended_at = excluded.ended_at, result = excluded.result,
    was_main_wake_up = excluded.was_main_wake_up, updated_at = excluded.updated_at, synced_at = now()
  where o.updated_at <= excluded.updated_at;
$$;

revoke all on function public.sync_alarms(jsonb), public.sync_alarm_occurrences(jsonb) from public, anon;
grant execute on function public.sync_alarms(jsonb), public.sync_alarm_occurrences(jsonb) to authenticated;

-- ── Account deletion (App Store requirement) ─────────────────────────────────

-- Deletes the caller's account. Every table above references auth.users with
-- ON DELETE CASCADE, so the profile, cloud alarms, occurrences, XP ledger and
-- achievements go with it. Future social tables must cascade too. The phone's
-- local data is never touched by this.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
