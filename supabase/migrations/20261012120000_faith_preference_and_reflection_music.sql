-- Terbit MY · Phase 3C · Faith missions
--
-- 1. Faith preference on the PRIVATE profile.
--    It is only ever readable by its owner (the existing own-row-only RLS
--    policies on public.profiles; anonymous clients have no access). It must
--    never be exposed in Circles, to friends, on public profiles, in social
--    features or analytics. Any future social/public profile must be a
--    separate, allow-listed view or table that does NOT include this column.
--    Optional: null means "not chosen" (accounts and faith are both optional).

alter table public.profiles
  add column faith_preference text
  check (
    faith_preference is null
    or faith_preference in ('islam', 'christianity', 'buddhism', 'hinduism', 'non_religious', 'prefer_not_to_say')
  );

comment on column public.profiles.faith_preference is
  'PRIVATE. Owner-only (RLS). Never expose in social, public-profile or analytics features.';

-- 2. Storage for DEVELOPMENT PLACEHOLDER Reflection music.
--    A public, read-only bucket: anyone with the URL can download a file;
--    nobody can upload, change or delete through the app (no storage policies
--    are granted). Files are uploaded by the project owner in the dashboard.
--    Placeholder tracks are never production-approved: production music needs
--    the "Production Reflection Music Catalogue and Licensing Approval"
--    (docs/REFLECTION-MUSIC.md).

insert into storage.buckets (id, name, public)
values ('reflection-music', 'reflection-music', true)
on conflict (id) do nothing;
