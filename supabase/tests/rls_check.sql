-- Terbit MY · manual Row Level Security check (run in Supabase → SQL Editor).
--
-- Before running: sign in from the app with TWO different email addresses
-- (so two users exist), then paste their user IDs below. Find them in
-- Authentication → Users. Everything runs inside a transaction that is
-- rolled back, so nothing is changed.

begin;

-- Act as user A, exactly like the app does (role "authenticated" + A's id).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"USER_A_ID","role":"authenticated"}', true);

-- 1. A sees only A's rows. Every count must be 0.
select 'profiles of others' as check, count(*) from public.profiles where id <> 'USER_A_ID'
union all select 'alarms of others', count(*) from public.alarms where user_id <> 'USER_A_ID'
union all select 'occurrences of others', count(*) from public.alarm_occurrences where user_id <> 'USER_A_ID'
union all select 'xp of others', count(*) from public.xp_ledger where user_id <> 'USER_A_ID'
union all select 'achievements of others', count(*) from public.achievements where user_id <> 'USER_A_ID';

-- 2. A cannot write a row for B. This must FAIL with "new row violates row-level security policy".
insert into public.xp_ledger (user_id, award_key, amount, reason, earned_at)
values ('USER_B_ID', 'rls-test', 1, 'mission_completed', 0);

rollback;

-- 3. Anonymous clients see nothing (run separately). Must fail with "permission denied".
-- begin; set local role anon; select count(*) from public.alarms; rollback;
