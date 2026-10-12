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
- **Status shown to the user:**
  - Local only;
  - Syncing…;
  - Synced;
  - Offline;
  - Sync problem.

  Development builds also show the user ID, pending count, last sync time and last error.

### Conflict policy

- **Alarms (editable):** newest `updated_at` wins. A tie takes the incoming copy (the same edit sent again). Deletions are tombstones and follow the same rule.
- **Occurrences:** same rule. They only move forward, and each step bumps `updated_at`.
- **XP ledger and achievements:** insert once by stable key, never changed or duplicated.
- **Changes are found by content fingerprint, not by `updated_at` alone.** So changes that don't touch `updated_at` are still sent, for example another alarm losing its Main Wake-Up flag.
- **Not in this phase:** the cloud is a backup. Pulling cloud data onto a phone (restore / cross-device sync) comes later and will use the same rules.

## Account deletion

`delete_my_account()` deletes the auth user. Every table references `auth.users … on delete cascade`, which removes:
- the profile;
- cloud alarms;
- cloud occurrences;
- the XP ledger;
- achievements;
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

For EAS cloud builds, add the same two variables as EAS environment variables (`EXPO_PUBLIC_…`). `.env.local` stays on your computer.

## Status and beta-stage verification

**Done (12 Oct 2026):**
- The project is created, and the schema and RLS are applied.
- Public values are in `.env.local`.
- A live probe confirmed that all tables and functions exist and that anonymous access is refused.

**Deferred to beta.** Terbit MY is a working name, so no permanent domain or email sender exists yet. Before beta testers are invited:
1. Set up a custom SMTP provider, a sender domain and a branded sender address (step 6 above). Confirm the email templates show the `{{ .Token }}` code.
2. Check real OTP delivery to an address outside the Supabase project team.
3. On iPhone, test guest → account: sign in, then confirm existing alarms, occurrences, XP and achievements appear in the Table Editor.
4. Test offline → reconnect backup: the Account status goes from Offline to Synced, and no rows are duplicated.
5. Sign out (local data stays), then sign in again (no duplicates, only changes sent).
6. Delete the account against the live backend (cloud rows gone, local data kept).
7. Run `supabase/tests/rls_check.sql` with two real test accounts.
8. Cross-device restore. **Not built yet:** the cloud is backup-only. It's a later phase item, using the conflict policy above.

Until then, Terbit MY is used as a guest. Nothing requires an account, and guests make no cloud calls.
