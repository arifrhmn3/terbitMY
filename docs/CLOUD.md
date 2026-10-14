# Accounts & Cloud (Phase 2B)

Terbit MY is **local first, cloud second.** Alarms, missions, XP, streaks and achievements live in SQLite on the phone and never need the internet. An account is optional. Signing in adds a private cloud **backup** in Supabase, for future cross-device sync, circles and subscriptions.

## Architecture

```
Screens ─► features/account (account store: guest / signed in, profile)
        └► features/sync    (sync engine: phone → cloud backup, retries, status)
                 │
                 ▼
services/cloud  AuthService + CloudStore interfaces
   ├─ supabase-cloud.ts   the only file that talks to Supabase
   └─ testing/memory-cloud.ts   in-memory stand-in for tests (same rules as the schema)
```

- `getCloud()` returns `null` when the build has no Supabase settings. The app is then local-only, and Settings → Account says so.
- **Auth:** email one-time code (`signInWithOtp` → 6-digit code → `verifyOtp`). There are no passwords or deep links. The session is saved on the phone (`expo-sqlite/localStorage`), so it survives restarts and works offline. Apple and Google sign-in come later, behind the same `AuthService`.
- **Profile** (`profiles`): display name, avatar URL and time zone only. A database trigger creates it at sign-up; the app also upserts the time zone.

## Cloud schema (`supabase/migrations/20261011120000_accounts_cloud_foundation.sql`)

| Table | Key | Contents | Write rule |
|---|---|---|---|
| `profiles` | `id` = user | display_name, avatar_url, timezone | upsert |
| `alarms` | (user_id, id) | time, weekdays, enabled, label, mission, snooze, `is_main_wake_up`, mode, sound, created/updated_at, `deleted_at` tombstone | newest `updated_at` wins (`sync_alarms`) |
| `alarm_occurrences` | (user_id, id), unique (user_id, alarm_id, scheduled_at) | full occurrence incl. `was_main_wake_up`, status, timestamps, result | newest `updated_at` wins (`sync_alarm_occurrences`) |
| `xp_ledger` | (user_id, award_key) | category, amount, reason, earned_at | insert once |
| `achievements` | (user_id, id) | unlocked_at, occurrence_id | insert once |

- Phone times are stored as **bigint milliseconds**, exactly as on the phone.
- **Derived values aren't stored:** no totals, streaks or ranks. They can be recalculated from these records.
- **Row Level Security** is on every table. Each table has select, insert, update and delete policies limited to `auth.uid()`. `anon` has no access. The sync functions run as the caller (`security invoker`), so RLS applies to them too. Only the sign-up trigger and `delete_my_account` are privileged.
- **Automated checks:** `src/services/cloud/cloud-config.test.ts` checks the SQL. **Manual check:** `supabase/tests/rls_check.sql`.

## Guest use and guest → account

- **Local records carry no account.** Sync keeps a per-account `sync_state` table on the phone (migration 8), holding a content fingerprint of each record already sent.
- **Signing in** (new or existing account) makes every local record "pending" for that account, so the guest's existing alarms, history, XP and achievements are backed up. Nothing local changes.
- **Signing out** only ends the session. All local data stays, and the app carries on as a guest. Records changed while signed out are sent at the next sign-in.
- **Known limit:** if a different account signs in on the same phone, this phone's data is backed up to that account too. The phone holds one person's data.

## Sync (`features/sync`)

- **Local writes never wait for the cloud.** Sync runs on these triggers:
  - sign-in;
  - the app returning to the front;
  - alarm changes;
  - new XP or achievements;
  - each alarm hand-off run.

  Bursts of changes are combined (2 s debounce).
- **There's no separate queue that could be lost.** A record is pending until its current content has been accepted by the cloud. Offline or failed runs leave it pending, and it's retried after 30 s, 1 min, 2 min, 5 min, then every 15 min, plus whenever the app returns to the front.
- **Order:** alarms, then alarm deletions (tombstones), then occurrences, XP and achievements, in chunks of 200. Each chunk is marked synced only after the cloud accepts it.
- **Idempotent:** re-sending anything is harmless (stable IDs, newest-wins or insert-once), so events are never duplicated.
- **Status shown to the user** (`features/sync/status-label.ts`; plain words, never a raw error):
  - Local only (guest);
  - Sync pending (a change is waiting for the next run);
  - Syncing…;
  - Synced · Last synced 14:05 (from the phone's `sync_state`, so it survives restarts; it isn't bumped when there was nothing to send);
  - Offline · "N changes will back up when you're online";
  - Sign-in required (the cloud rejected the sign-in; retried; or Supabase ended the session);
  - Sync failed (anything else; retried with back-off).

  Development builds also show the user ID, pending count, last sync time and the technical last error (Settings → Developer tools).

### Conflict policy

- **Alarms (editable):** newest `updated_at` wins. A tie takes the incoming copy (the same edit sent again). Deletions are tombstones and follow the same rule.
- **Occurrences:** same rule. They only move forward, and each step bumps `updated_at`.
- **XP ledger and achievements:** insert once by stable key, never changed or duplicated.
- **Changes are found by content fingerprint, not by `updated_at` alone.** So changes that don't touch `updated_at` are still sent, for example another alarm losing its Main Wake-Up flag.
- **Not in this phase:** the cloud is a backup. Pulling cloud data onto a phone (restore / cross-device sync) comes later and will use the same rules.

## Phase 5A: live accounts and sync verification

### Audit of Phase 2B (13 Oct 2026)
- **Auth:** email one-time code only (`signInWithOtp` with `shouldCreateUser`, then `verifyOtp` type `email`). No magic-link handling, deep links or passwords. This is the right choice for mobile: no redirect URLs, works in any email app.
- **Live project** (anonymous probe with the public key, nothing written):
  - every table and the three functions refuse anonymous access (`42501 permission denied`);
  - `profiles.faith_preference` exists, so both migrations are applied;
  - `night_routines` and `sync_state` don't exist in the cloud (phone only, by design);
  - Email sign-in is on, sign-ups are allowed, and "Confirm email" is on, so a **new** user gets the **Confirm signup** email and a returning user the **Magic Link** email. Both templates must show `{{ .Token }}` (setup step 3.2).
- **Sync scope (confirmed in code):** profile (time zone, display name, private Faith preference), alarms, occurrences, XP ledger, achievements. Nothing else. The Night Routine, Screen Time selection, settings and sync state stay on the phone; a test checks this.
- **Backup only:** the phone is the source of truth and nothing is downloaded. "Signing back in" on the same phone needs no restore: local data was never removed, and only changed records are sent. **Restoring onto a new phone or after reinstalling isn't built** (a later sub-phase, before beta).

### Email for development (no domain, no custom SMTP)
- **Not used for a live test now:** the owner deferred live email testing to beta (see "Beta-stage verification"). For a quick optional check before then, Supabase's built-in email works with these limits:
  - it only delivers to **members of the Supabase organisation's team** (anyone else gets "Email address not authorized", shown in the app as "This email address can't receive sign-in codes yet");
  - **about 2 emails per hour** (shown as "Please wait a few minutes…");
  - not for production, no delivery guarantee.
- So test with the project owner's email (a team member). For the two-account RLS check, create the second user in Authentication → Users → **Add user** (no email needed), or invite a second address to the team.
- Custom SMTP, a sender domain and branded templates stay deferred until the name and domain are final. Nothing in the app depends on the domain.

### Session behaviour
- Saved on the phone (expo-sqlite localStorage, Supabase's default key), restored at start-up without the network.
- Access tokens are refreshed while the app is in front.
- **Offline with an expired access token** (for example, opening Terbit MY the next morning in airplane mode), Supabase keeps the session but reports none. Terbit MY then reads the saved session, so the user stays signed in and sync shows Offline instead of looking like a guest (fixed in 5A).
- If Supabase really ends the session (refresh token rejected), the app becomes a guest with **"Sign-in required"**. Local data is untouched.
- Sign out ends this phone's session only (`scope: 'local'`, works offline) and keeps all local data.

### What Circles (Phase 5B+) can rely on
- A stable user ID: `auth.users.id`, which is also `profiles.id`.
- A profile row for every account (sign-up trigger, plus the app's upsert).
- The session persists across restarts and offline.
- Cloud calls work with RLS (`auth.uid()`), and backup sync is idempotent.
- Guest mode still works; Circles must handle "no account".
- **Not ready for social use as-is:** `profiles` is owner-only and holds the PRIVATE `faith_preference`. Circles must add a **separate, allow-listed** shareable identity (minimum: a display name, already on the profile, exposed through a view or table that never includes `faith_preference`, `timezone` or `avatar_url` unless chosen). No usernames, bios, avatars or followers until Circles needs them.
- **One person per phone:** if a different account signs in on the same phone, this phone's data is backed up to that account too (known limit above). Circles should show which account is signed in.

## Circles (Phase 5B)

Private, invite-only accountability groups. **5B is membership only:** no feed, check-ins, reactions or push notifications, and no activity is shared. (The old 5C/5D plans are superseded; Terbitan and notifications are Phase 6E in docs/ROADMAP.md.) Migration: `supabase/migrations/20261013120000_circles_foundation.sql`. Security check: `supabase/tests/circles_rls_check.sql`.

### Schema

| Table | Key | Contents | Who can do what (RLS + grants) |
|---|---|---|---|
| `circle_identities` | `user_id` | `display_name` (1–40, trimmed, not unique), created/updated_at. **Nothing else.** | Read: yourself, and people you share a Circle with. Insert/update: your own row, `display_name` only (through `set_circle_identity`) |
| `circles` | `id` (random uuid) | `name` (1–40, not unique), `owner_user_id`, created/updated_at | Read: members. Update `name` only: owner. Delete: owner. No client insert |
| `circle_members` | (`circle_id`, `user_id`) | `role` (`owner` / `member`), joined_at | Read: members of that Circle. Delete: your own row if you're a `member`. No client insert or update |
| `circle_invites` | `code` | one current code per Circle (`circle_id` unique), created_by, expires_at | Read: the Circle's owner. No client writes |
| `circle_join_failures` | — | user_id, failed_at | No client access at all |

- **Database-enforced rules:** one membership per person per Circle (primary key); exactly one owner per Circle (partial unique index); roles limited to owner/member; names checked (length, trimmed, no control characters); code format checked.
- **Anonymous clients:** all privileges revoked on every Circles table and function.
- **Supabase's default grants are removed first** (`revoke all … from public, anon, authenticated`), then exactly the operations above are granted back.

### Shareable vs private identity
- `profiles` is **private** (owner-only): account display name, time zone, the Faith preference. Circles never read it: no Circles SQL, policy, function or app code mentions it, and tests check this (`circles-schema.test.ts`, `circles.test.ts`, and the SQL check reads `pg_proc` / `pg_policies`).
- `circle_identities` is the **only** thing other members see. It's chosen in Circles ("How should people in your Circles see you?"), not copied from the account, and editable in Circles → Your name in Circles.

### Functions (all `set search_path = ''`, all check `auth.uid()`)

| Function | Runs as | Does | Returns |
|---|---|---|---|
| `set_circle_identity(new_display_name)` | caller (RLS applies) | saves your name | `saved` / `invalid_name` |
| `create_circle(circle_name)` | definer | Circle + owner row + first invite, together | `created` (id, code, expiry) / `needs_name` / `invalid_name` / `limit_reached` (20 owned) |
| `preview_circle_invite(invite_code)` | definer | checks a code | `valid` + **the Circle name only** + `already_member` / `invalid` / `rate_limited` |
| `join_circle_by_code(invite_code)` | definer | adds you as a member (locks the Circle row; `on conflict do nothing`) | `joined` / `already_member` (both with id and name) / `invalid` / `rate_limited` / `needs_name` / `full` (50) |
| `new_circle_invite(target_circle)` | definer | owner only: replaces the code | `ok` (code, expiry) / `not_owner` |

Two small definer helpers (`is_circle_member`, `shares_circle_with`) are used by the policies; they only answer yes/no about the caller. The internal helpers (code generation, normalising, issuing, rate limit) aren't callable by clients. Expected outcomes are returned as a status rather than raised as errors, so a wrong code is still recorded for the rate limit.

### Invites
- **Code:** 8 characters from Crockford base32 (`0-9 A-Z` without I, L, O, U), drawn from `gen_random_uuid()`'s strongly random bytes (the fixed UUID version/variant bytes are skipped): 40 bits, about 1.1 trillion codes. Never derived from the Circle id. Typed codes ignore case, spaces and dashes; O reads as 0, I/L as 1. Shown as `ABCD-EFGH`.
- **Expiry:** 7 days. One current code per Circle; "New code" replaces it and the old one stops working at once. People already in the Circle stay.
- **Brute force:** 10 wrong codes per user in 15 minutes, then preview and join are refused for that user. With 40-bit codes this makes guessing impractical. **Later hardening (not built):** per-IP limits through an Edge Function, and invite links (deep links) on top of the same codes.
- **Before joining,** only the Circle's name is revealed (not members, owner or count).

### Owner / member and leaving
- The creator is the owner and a member (one row, role `owner`).
- **Members** can leave; the Circle disappears from their list, and nothing on their phone changes.
- **The owner can't leave**; they can **delete the Circle** (with confirmation), which removes all memberships and the invite through cascades. Chosen as the least surprising rule: "Leave" never silently deletes a group or hands it to someone. **Ownership transfer** and removing a member are later additions.
- **Account deletion** (`delete_my_account`): the user's identity, memberships and failed attempts cascade; **Circles they own are deleted** (with their members and invites). Other users' accounts, profiles and identities are untouched. If transfer is added later, it can run before deletion.

### In the app
- `services/cloud` → `CirclesApi` (`supabase-cloud.ts`; `testing/memory-cloud.ts` mirrors the same rules for tests).
- `features/circles/circles-store.ts` follows the account and fetches only when a Circles screen is focused. Nothing runs at start-up, and alarms, missions, XP, Night Routine and camera missions never wait for Circles.
- **Offline:** the last list, your name and the member lists are cached on the phone (`app_settings` → `circles.cache`, for the signed-in account only) and shown read-only with an "Offline" banner. Actions say "You're offline. Try again when you're connected." **The cache is deleted at sign-out**, so other people's Circle names don't stay on a shared phone.
- Errors are plain words; developer builds add the technical detail in brackets.

### Setup (one time, about 5 minutes)
1. Supabase → **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261013120000_circles_foundation.sql` in VS Code, select everything (Ctrl+A), copy, paste it into the query, and click **Run**. Expected: "Success. No rows returned".
3. New query → paste the whole of `supabase/tests/circles_rls_check.sql` → **Run**. Expected last result: **"All Circles security checks passed"**. It uses three throwaway test users and rolls everything back, so nothing is kept and no email is needed. If it stops with `CHECK FAILED: …`, copy that line and send it to Claude.
4. New query → paste the whole of `supabase/tests/circles_live_verify.sql` → **Run**. It's **read-only**. It compares the live database with the repository: the Circles tables, columns, RLS, policies, function code, privileges and indexes, and that the 2B/5A tables, policies, functions and sign-up trigger are unchanged. Expected last row: **"ALL CHECKS MATCH THE REPOSITORY"**. A `false` row names what differs.
5. Nothing else: no new build, no new keys.

**Status (14 Oct 2026): ✅ done on the live project.** Step 3 passed ("All Circles security checks passed") and step 4 passed ("ALL CHECKS MATCH THE REPOSITORY"). An anonymous probe with the public key also shows every Circles and 2B/5A table and function refusing anonymous access ("permission denied"; a made-up name gives "not found"). The SQL Editor doesn't record migration versions (`supabase_migrations` is used only by the Supabase CLI), so step 4 checks the schema itself instead. A migration can't be applied twice: its `create table` statements fail on a second run.

### Rollback
The end of the migration has a commented-out rollback block (drop the five functions, the five tables, then the helpers). It deletes every Circle. The earlier tables are unaffected either way, because nothing outside Circles references them.

## Account deletion

`delete_my_account()` deletes the auth user. Every table references `auth.users … on delete cascade`, which removes:
- the profile;
- cloud alarms;
- cloud occurrences;
- the XP ledger;
- achievements;
- Circles data: the Circle identity, memberships and failed join attempts, and **the Circles the user owns** (with their members and invites);
- any future social data (future tables **must** also cascade).

Settings → Account → Delete account calls it, signs out, and **keeps the phone's data**. Deleting local data stays a separate, explicit choice (for now, by deleting the app).

## Supabase setup (one time)

1. **Create the project:** [supabase.com](https://supabase.com) → New project. Name it `terbit-my`, choose the region **Southeast Asia (Singapore)**, and save the database password in a password manager.
2. **Create the tables:**
   1. SQL Editor → New query.
   2. Paste the whole of `supabase/migrations/20261011120000_accounts_cloud_foundation.sql` and click **Run**. It should say "Success. No rows returned".
3. **Email sign-in:**
   1. Authentication → Sign In / Providers → **Email** should be enabled (it is by default).
   2. Authentication → **Emails** → Templates. In both **Magic Link** and **Confirm signup**, add this line to the body, then save each:
      `<p>Your Terbit MY code: <strong>{{ .Token }}</strong></p>`
4. **Copy the two public values:**
   - **Project URL:** Project Settings → Data API, or the **Connect** button.
   - **Publishable key** (`sb_publishable_…`): Project Settings → API Keys. The legacy **anon** key also works.
   - **Never copy the secret / service_role key.**
5. **Add them to the app:**
   1. Copy `.env.example` to `.env.local` and paste both values.
   2. Restart `npm start`.
6. *(Before beta)* **Email delivery:** Supabase's built-in email sends only a few messages per hour, which is fine for testing. Set up custom SMTP (Authentication → Emails → SMTP Settings) before inviting testers.
7. *(Optional)* **Check the security rules:** run `supabase/tests/rls_check.sql` after two test accounts exist.
8. **Phase 3C (Faith):** SQL Editor → run `supabase/migrations/20261012120000_faith_preference_and_reflection_music.sql` (adds the PRIVATE `profiles.faith_preference` column and the public, read-only `reflection-music` Storage bucket). Then Storage → `reflection-music` → upload the three files in `supabase/storage/reflection-music/` (development placeholder music).
9. **Phase 5B (Circles):** run the Circles migration, then the Circles security check and the live schema check. See "Circles (Phase 5B)" → Setup. ✅ Done on the live project (14 Oct 2026).

For EAS cloud builds, add the same two variables as EAS environment variables (`EXPO_PUBLIC_…`). `.env.local` stays on your computer.

## Status and beta-stage verification

**Done (12 Oct 2026):**
- The project is created, and the schema and RLS are applied.
- Public values are in `.env.local`.
- A live probe confirmed that all tables and functions exist and that anonymous access is refused.

**Phase 5A (13 Oct 2026):** complete on the repository side. The architecture is unit-tested, and a live probe confirmed that anonymous access is refused and both migrations are applied.

**Phase 5B (14 Oct 2026):** complete. The Circles migration is live; `circles_rls_check.sql` and `circles_live_verify.sql` both pass on the live project. Signed-in Circles testing is deferred to beta (item 8 below).

**Beta-stage verification: deferred by owner decision (13 Oct 2026), required before beta.** Terbit MY is a working name, so no domain is bought and no custom email sender exists. Real email delivery and live sign-in testing wait until then. This was a deliberate choice, not a blocker. Before beta testers are invited, do all of these (the detailed steps follow):

1. **Final name and domain** chosen and bought.
2. **Custom SMTP** (Authentication → Emails → SMTP Settings) with a sender address on that domain.
3. **Branded auth email templates** (Confirm signup and Magic Link), each showing the 6-digit `{{ .Token }}` code.
4. **Live OTP email delivery**, including to an address outside the Supabase project team.
5. **Real iPhone sign-in with production-style email**, then the full account checklist: guest → account (existing alarms, history, XP, achievements appear once in the Table Editor), sync twice and restart (no duplicates), sign out (local data stays), sign back in (no duplicates), airplane mode → reconnect (Offline → Synced), delete account (cloud rows gone, local data kept).
6. **Two-account live RLS check:** `supabase/tests/rls_check.sql` with two real accounts.
7. **New-device / cloud restore**, once restore is built (the cloud is backup-only today).
8. **Circles, live and account-dependent (Phase 5B; deferred by owner decision):**
   - live OTP delivery for both test accounts;
   - real iPhone sign-in with a real account;
   - setting a Circles display name through the live app;
   - creating, renaming and sharing a live Circle (you're the owner; invite code and expiry shown; Share invite; New code; Rename);
   - joining with an invite code on a second account (preview shows the name only; join; joining again makes no duplicate; wrong code → "That invite code isn't valid");
   - two accounts on two phones (or one phone, switching accounts);
   - live member-list privacy: both Circles names and the owner badge, and no email, Faith, time zone or progress;
   - leave (member) and delete (owner) flows, and the owner can't leave;
   - the authenticated offline Circles cache (Airplane mode: last list shown, actions say "You're offline");
   - the Circles cache cleared at sign-out.

   Until then the rules are covered by unit tests and `supabase/tests/circles_rls_check.sql` (no email needed). Full list: PROJECT_STATUS.md → Beta requirements → item 8.

Detailed steps:
1. Set up a custom SMTP provider, a sender domain and a branded sender address (step 6 above). Confirm the email templates show the `{{ .Token }}` code.
2. Check real OTP delivery to an address outside the Supabase project team.
3. On iPhone, test guest → account: sign in, then confirm existing alarms, occurrences, XP and achievements appear in the Table Editor.
4. Test offline → reconnect backup: the Account status goes from Offline to Synced, and no rows are duplicated.
5. Sign out (local data stays), then sign in again (no duplicates, only changes sent).
6. Delete the account against the live backend (cloud rows gone, local data kept).
7. Run `supabase/tests/rls_check.sql` with two real test accounts.
8. Cross-device restore. **Not built yet:** the cloud is backup-only. It's a later phase item, using the conflict policy above.

Until then, Terbit MY is used as a guest. Nothing requires an account, and guests make no cloud calls.
