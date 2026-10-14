-- Terbit MY · Phase 5B · live schema verification (run in Supabase → SQL Editor).
--
-- READ-ONLY: changes nothing. Compares the live database with the
-- repository migrations (2B, 3C, 5B): Circles tables, columns, RLS, policies,
-- function code and settings, privileges and indexes, and confirms the
-- existing 2B/5A tables, policies, functions and the sign-up trigger are
-- unchanged. Expected values were computed by applying the repository
-- migrations to a clean Postgres.
--
-- Result: one row per check (ok = true), then a final row
-- "ALL CHECKS MATCH THE REPOSITORY". Any "false" row: send it to Claude.
--
-- Generated for 20261013120000_circles_foundation.sql, sha256 dc5d0b04c6263b4d99255cc95f66dc0b61318b166e294fc2d433b8c3ecded9a7
-- (a unit test fails if the migration changes without regenerating this file).
--
-- Note: handle_new_user (Phase 2B sign-up trigger) is executable by anon
-- because of Supabase's default grants. That is expected and harmless: a
-- trigger function can't be called directly or through the API.

with
circle_tables as (
  select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('circle_identities', 'circles', 'circle_members', 'circle_invites', 'circle_join_failures')
),
backup_tables as (
  select c.oid, c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('profiles', 'alarms', 'alarm_occurrences', 'xp_ledger', 'achievements')
),
circle_fns as (
  select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'circles_touch_updated_at', 'is_circle_member', 'shares_circle_with', 'circles_new_invite_code',
     'circles_normalise_invite_code', 'circles_issue_invite', 'circles_join_rate_limited', 'set_circle_identity',
     'create_circle', 'preview_circle_invite', 'join_circle_by_code', 'new_circle_invite')
),
backup_fns as (
  select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('handle_new_user', 'sync_alarms', 'sync_alarm_occurrences', 'delete_my_account')
),
fn_print as (
  select f.proname, md5(concat_ws('|', f.proname, pg_get_function_identity_arguments(f.oid), p.prosecdef, p.provolatile,
         array_to_string(p.proconfig, ','), md5(replace(p.prosrc, chr(13), '')))) as h
    from pg_proc p join (select * from circle_fns union all select * from backup_fns) f on f.oid = p.oid
),
actual as (
  select 'circle tables (RLS on)' as check_name,
         (select count(*) || ' tables, ' || count(*) filter (where relrowsecurity) || ' with RLS' from circle_tables) as actual
  union all select 'circle columns',
         (select md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ',' order by table_name, column_name))
            from information_schema.columns where table_schema = 'public' and table_name in (select relname from circle_tables))
  union all select 'circle policies',
         (select count(*) || ' / ' || md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ','), ',' order by tablename, policyname))
            from pg_policies where schemaname = 'public' and tablename in (select relname from circle_tables))
  union all select 'circle functions (code + settings)',
         (select count(*) || ' / ' || md5(string_agg(h, ',' order by proname)) from fn_print where proname in (select proname from circle_fns))
  union all select 'circle functions not duplicated',
         (select count(*) || ' rows for ' || count(distinct proname) || ' names' from circle_fns)
  union all select 'circle indexes and constraints',
         (select md5(string_agg(c.relname || ':' || i.relname, ',' order by c.relname, i.relname))
            from pg_index x join pg_class i on i.oid = x.indexrelid join circle_tables c on c.oid = x.indrelid)
  union all select 'circle table grants (anon, authenticated)',
         (select coalesce(md5(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' order by grantee, table_name, privilege_type)), 'none')
            from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in (select relname from circle_tables))
  union all select 'circle column grants (authenticated)',
         (select coalesce(md5(string_agg(table_name || '.' || column_name || ':' || privilege_type, ',' order by table_name, column_name, privilege_type)), 'none')
            from information_schema.column_privileges
           where table_schema = 'public' and grantee = 'authenticated' and table_name in ('circle_identities', 'circles')
             and privilege_type in ('INSERT', 'UPDATE'))
  union all select 'anon privileges on any Circles or backup table',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon'
             and table_name in (select relname from circle_tables union all select relname from backup_tables))
  union all select 'functions anonymous clients can run',
         (select coalesce(string_agg(proname, ',' order by proname), 'none') from (select * from circle_fns union all select * from backup_fns) f
           where has_function_privilege('anon', f.oid, 'execute'))
  union all select 'functions signed-in users can run',
         (select string_agg(proname, ',' order by proname) from (select * from circle_fns union all select * from backup_fns) f
           where has_function_privilege('authenticated', f.oid, 'execute'))
  union all select 'backup tables (RLS on)',
         (select count(*) || ' tables, ' || count(*) filter (where relrowsecurity) || ' with RLS' from backup_tables)
  union all select 'backup policies (unchanged)',
         (select count(*) || ' / ' || md5(string_agg(tablename || ':' || policyname || ':' || cmd, ',' order by tablename, policyname))
            from pg_policies where schemaname = 'public' and tablename in (select relname from backup_tables))
  union all select 'backup functions (unchanged code)',
         (select count(*) || ' / ' || md5(string_agg(h, ',' order by proname)) from fn_print where proname in (select proname from backup_fns))
  union all select 'sign-up trigger',
         (select count(*)::text from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal)
  union all select 'private faith_preference column',
         (select count(*)::text from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'faith_preference')
),
expected (n, check_name, value) as (
  values
    (1, 'circle tables (RLS on)', '5 tables, 5 with RLS'),
    (2, 'circle columns', '5ba718ac9b92df6a0a8eef68f810b2d3'),
    (3, 'circle policies', '9 / 15a49e0675ed0fa8cc6ff5ec229ed1c8'),
    (4, 'circle functions (code + settings)', '12 / 7452bc6d188e181a462725a4138dc62a'),
    (5, 'circle functions not duplicated', '12 rows for 12 names'),
    (6, 'circle indexes and constraints', 'c0c2effe5c1b9e65f2ba366f21da9161'),
    (7, 'circle table grants (anon, authenticated)', '51b2ae511bfafae1596e1828a268a626'),
    (8, 'circle column grants (authenticated)', '8ee9c1d77e2b6dca59b07f8d52c09177'),
    (9, 'anon privileges on any Circles or backup table', '0'),
    (10, 'functions anonymous clients can run', 'handle_new_user'),
    (11, 'functions signed-in users can run', 'create_circle,delete_my_account,handle_new_user,is_circle_member,join_circle_by_code,new_circle_invite,preview_circle_invite,set_circle_identity,shares_circle_with,sync_alarm_occurrences,sync_alarms'),
    (12, 'backup tables (RLS on)', '5 tables, 5 with RLS'),
    (13, 'backup policies (unchanged)', '20 / f920d5ac30116e53fc9cb40ad6c3406c'),
    (14, 'backup functions (unchanged code)', '4 / 809ec83ec8af95baa644d154d3c3aa9a'),
    (15, 'sign-up trigger', '1'),
    (16, 'private faith_preference column', '1')
),
results as (
  select e.n, e.check_name, e.value as expected, a.actual, a.actual is not distinct from e.value as ok
    from expected e left join actual a on a.check_name = e.check_name
)
select n, check_name, expected, actual, ok from results
union all
select 99, 'migration history (informational)', null,
       case when to_regclass('supabase_migrations.schema_migrations') is null
            then 'not tracked: migrations were run in the SQL Editor'
            else (query_to_xml('select string_agg(version, '','' order by version) as v from supabase_migrations.schema_migrations', false, true, ''))::text end,
       null
union all
select 100, case when bool_and(ok) then 'ALL CHECKS MATCH THE REPOSITORY' else count(*) filter (where not ok) || ' CHECK(S) DIFFER' end,
       null, null, bool_and(ok)
  from results
order by n;
