# Project Status

_Last updated: 14 October 2026 (roadmap realigned after Phase 6A; Phase 6B not started)_

**The canonical roadmap is [docs/ROADMAP.md](docs/ROADMAP.md).** This file records results and test history; for what comes next and in what order, ROADMAP.md wins.

## Current phase

**Phase 1 (iOS prototype) is closed: complete, physically verified on iPhone (11 October 2026) and merged into `main`.** Android work is deferred to **Phase 7 (Android parity & Android beta)** (see "Android status" below). See [docs/ROADMAP.md](docs/ROADMAP.md).

**Phase 2A (local Progress Engine) is complete and verified on iPhone. Phase 2B (Accounts & Cloud Foundation) is complete on the repository side (12 Oct 2026): the Supabase project, schema and RLS are live; live sign-in and cloud-sync testing are deferred to the beta stage (see "Deferred to beta" below).**

**Phase 3 (3A Education, 3B Fitness, 3C Faith, 3D Settings & Accessibility, 3.5 Core UX Consolidation) is complete, verified on iPhone and merged into `main` (13 Oct 2026).**

**Phase 4 (Bedtime & Restrictions: the Night Routine) is complete, verified on iPhone in the `development-screen-time` build and merged into `main` (13 Oct 2026).**

**Phase 4.5 (Camera-Verified Fitness Missions: push-ups, squats, jumping jacks, chair sit-to-stand) is complete, physically verified on iPhone in the `development-screen-time` build and merged into `main` (13 Oct 2026).**

**Phase 5A (Live Accounts & Sync Verification) is complete on the repository side and merged into `main` (13 Oct 2026). Live email sign-in testing is intentionally deferred to beta, because the public name and domain aren't chosen yet (see "Beta requirements").**

**Phase 5B (Circles Foundation) is complete and merged into `main` (14 Oct 2026).** Private, invite-only Circles: a separate shareable display name, create, join by code, member list, leave, rename, delete, owner/member roles, RLS. Membership only: no feed, check-ins, reactions or notifications (the old 5C/5D plans are superseded and absorbed into Phase 6: Terbitan and notifications are 6E). The migration is live, and both live SQL checks pass ("All Circles security checks passed", "ALL CHECKS MATCH THE REPOSITORY"). The signed-out Circles state is verified on iPhone. Live sign-in and signed-in Circles testing stay deferred to beta (owner decision; "Beta requirements" → item 8).

**Phase 6A (Personalisation & Onboarding) is complete, physically verified on iPhone and merged into `main` (14 Oct 2026)** from `phase-6/personalisation-onboarding`. **6B UI/UX Design Review is next and not started.** 6C–6I are not started; Phase 7 (Android parity & Android beta) is deferred until iOS beta / release-readiness is stable. The old 5C/5D plans are superseded (see docs/ROADMAP.md).

## Phase 2A: local Progress Engine

| Item | Status |
|---|---|
| XP ledger + achievements in SQLite (migration 6), unique keys so XP is never awarded twice | ✅ Unit-tested on real SQLite, including the upgrade from a Phase 1 database |
| Streak engine (local calendar day, any-success-per-day rule, neutral days, multiple alarms per day) | ✅ Unit-tested, including time zone and midnight cases |
| Education / Fitness / Faith XP and placeholder ranks (overall + per discipline) | ✅ Maths = Education; Fitness and Faith ready for later missions |
| Achievements (first morning, 3- and 7-day streaks, 10 missions, first Challenge), data-driven | ✅ Unlock once, unit-tested |
| Progress tab with real data; XP shown on "Morning complete" | ✅ Verified on iPhone |
| Developer panel: inspect, reset, seed an example week; XP accounting (total = disciplines + general/bonus) with every bonus line's source | ✅ Development builds only |
| First iPhone test (11 Oct) | ✅ XP once per mission, Education XP, one streak day per day, Challenge bonus, persistence, seeding |
| **Morning vs general accountability** (from the test): only the Main Wake-Up Alarm counts as a morning; other alarms earn XP and count in "All alarms". Each occurrence stores `isMainWakeUp` when it fires (migration 7) | ✅ Unit-tested · ✅ Verified on iPhone |

Provisional policy (all in `src/features/progress/policy.ts`): maths mission 10 XP; Challenge +5; Reward/Gentle +0; incomplete 0; 3-day streak +10; 7-day streak +25; overall ranks at 0/50/150/300/600/1000/2000 XP; discipline ranks at 0/30/100/250/500/1000 XP. See docs/ARCHITECTURE.md → Progression.

## Phase 0: Foundation ✅

| Check | Result |
|---|---|
| Project cloned and run locally on the owner's Windows computer | ✅ Done |
| npm dependencies installed (`npm install`) | ✅ Done |
| `npm run check` (lint, typecheck, unit tests) | ✅ Passes |
| `npx expo-doctor` | ✅ Passes (21/21 checks) |
| App opens on a physical iPhone through Expo Go | ✅ Done |
| Five main tabs reviewed on the device: Today, Alarms, Circles, Progress, Settings | ✅ Done |

### What Phase 0 delivered
- Expo SDK 57 + TypeScript project with Expo Router native tabs
- Theme tokens with light and dark mode, plus shared UI components
- Lint, typecheck and unit-test scripts, and a GitHub Actions CI workflow
- Planning documents: PRD, feasibility review, architecture, roadmap, Windows setup guide

### Notes from on-device testing
- If the iPhone can't reach the PC over Wi-Fi, use `npx expo start --tunnel`. Expo may offer to install `@expo/ngrok` for this. That is a local tool only and is not committed to the project.

## Phase 1: Alarms MVP (device-local) ✅ iOS prototype verified

"Verified on iPhone" means tested by the owner on a physical iPhone (iOS 26.1+) with the EAS development build.

| Item | Status |
|---|---|
| Development builds (`expo-dev-client`, `eas.json`); signed iOS build and Android APK installed on the owner's phones | ✅ Verified on device |
| Alarm data model: time, repeat days, on/off, mission, snooze preference, main wake-up alarm, **accountability mode** | ✅ |
| Alarm list + editor screens, saved in SQLite on the device; native time picker scrolls and saves | ✅ Verified on iPhone |
| Maths mission: Easy/Medium/Hard, 3/5/10 questions, retry, result, practice screen | ✅ Verified on iPhone |
| `AlarmService` interface (shared TypeScript; Swift and Kotlin behind it) | ✅ |
| Alarm occurrences, duplicate protection | ✅ Unit-tested, including real SQLite |
| Native alarm proof of concept (one-time test alarm) | ✅ Verified on iPhone and Android |
| **Saved alarms scheduled natively** (create/edit → schedule, disable/delete → cancel, weekday repeats) | ✅ Verified on iPhone · Android: built + unit-tested, device test in Phase 7 |
| **Genuine alarm → occurrence → configured mission → Recent mornings** | ✅ Verified on iPhone |
| **Accountability modes per alarm:** Reward / Gentle / Challenge, with `evaluateMorning`, `isRewardEligible`, `isStreakEligible` | ✅ Verified on iPhone |
| **One-tap "Stop & Open Terbit" / "Stop & Start Mission"** (iOS AlarmKit App Intents, per-mode icon) | ✅ Verified on iPhone. It opens straight into the configured mission **both when Terbit MY was closed and when it was in the background**. History: the button first didn't appear (fixed with the iOS 26.1 alert API); then it opened Today first (fixed with the native `onAlarmAction` event and the launch route); then it failed from the background (fixed: the Alarms tab `/alarms` was mistaken for the alarm screen, and navigation now waits until the app is active). |
| **Gentle reminders** (iOS local notification, 5/10/15 min) | ✅ Verified on iPhone · Android: in Phase 7 |
| **Entitlement layer** (`isFeatureAvailable`, `useEntitlement`, `FeatureGate`; local mock only) | ✅ Verified on iPhone: Free / Trial / Premium states visible, and Challenge follows the provisional rules. See docs/MONETISATION.md |
| Alarm sound catalog (basic/premium) and share-card architecture | ✅ Prepared (no library, no sharing UI) |
| Simulated flow ("Simulate alarm now"), developer "Native alarm test", "Test plan (developer)" | ✅ Developer builds only (`__DEV__`); not shown in release builds |

Final checks (11 Oct): `npm run check` passes (lint, typecheck and 242 unit tests, including real SQLite migrations); `npx expo-doctor` passes 21/21; iOS, Android and web bundles export without errors. Swift and Kotlin are compiled only by EAS Build (there's no local Xcode or Android SDK).

### Android status (deferred by decision, 11 Oct 2026)
- ✅ **Basic native alarm functionality was physically proven on Android** earlier in Phase 1 (milestone 1, on the owner's HONOR phone).
- ⚠️ **Later Android-native changes have not all been recompiled.** The Kotlin code changed in `fc8a5a6` and `59f24b9`, after the last Android build that was installed. Shared TypeScript still typechecks, and the Android JavaScript bundle exports.
- ⏸️ **Deferred on purpose:** Android compatibility, native compilation (EAS Android builds), physical testing and full feature parity. The priority is speed in finishing the iOS prototype, so phases no longer end with an Android build check.
- ➡️ All of this is handled in **Phase 7 (Android parity & Android beta)**, once iOS beta / release-readiness is stable. Expect some Kotlin compile fixes there.

### Accountability model (agreed product behaviour)

The phone's own alarm controls can always stop an alarm, and **Terbit MY never tries to disable or bypass them.** Stopping the alarm is recorded, but the morning stays open: the mission can still be completed until the deadline (`completion-policy.ts`: Reward 2 hours after the alarm, Challenge 1 hour, Gentle until the end of that day).

| Mode | Behaviour | Reward / streak eligible when |
|---|---|---|
| Reward *(default; existing alarms migrated)* | Stop normally; the mission is optional | The mission is completed |
| Challenge | Leads straight into the mission. Stopping early = incomplete Challenge morning | The mission is completed |
| Gentle | Stop normally; follow-up after N minutes if the mission isn't done (shown in the app; no notification yet) | The mission is completed |

Outcomes kept separate:
- **alarm outcome:** ringing, went off, stopped by phone, stopped for mission, dismissed in app, unanswered, cancelled;
- **mission outcome:** not required, not started, in progress, completed, skipped, abandoned;
- **mode**;
- **reward / streak eligibility**.

Rules live in `MODE_POLICIES` (`src/features/alarms/accountability.ts`), so beta behaviour can change without a database change. Phase 2 must use `isRewardEligible()` / `isStreakEligible()`.

### Development strategy: iOS-first prototype
New features are built and tested on the physical iPhone first. Android stays supported: the Android code already written is kept, and shared logic stays platform-neutral. But new native features aren't duplicated in Kotlin until the behaviour is validated, and there's no Android build per feature or per phase. Android compilation, testing and parity all happen in Phase 7 (Android parity & Android beta), once iOS beta / release-readiness is stable (policy updated 11 Oct 2026; Phase 7 set 14 Oct 2026). See docs/ROADMAP.md.

### Beta product assumptions (provisional, not permanent)
These are the current working assumptions for beta. They're deliberately configurable, so changing them doesn't need a database or screen change.

| Assumption | Current value | Where it's configured |
|---|---|---|
| Alarm modes | **Reward** (default), **Gentle**, **Challenge**, chosen per alarm | `MODE_POLICIES` in `src/features/alarms/accountability.ts` |
| Reward | Free | `ACCESS_POLICY` → `FREEMIUM_POLICY` in `src/features/entitlements/policy.ts` |
| Gentle | Free | same |
| Challenge | Premium (falls back to Reward without access) | same |
| Trial | Full access for the configured trial period (`trialDays`, currently 7) | same; Model B (`TRIAL_POLICY`, trial on first launch) is prepared. Intended direction (6F): a 3-day trial; see docs/ROADMAP.md |
| Rewards and streaks | Only a completed mission qualifies, in every mode | `MODE_POLICIES` |
| Completion window | Reward 2 hours after the alarm; Challenge 1 hour (both plus snooze time); Gentle until the end of that day. Gentle follow-up 5/10/15 minutes (separate) | `completion-policy.ts` |
| Billing | **None.** No paywall or pricing. Entitlement is a local mock, switchable only in developer builds | `src/services/entitlements` |

### Accepted iOS limitations for beta
- **Apple's own Stop control can't be removed.** The Terbit button supplements it; using Stop ends the alarm without the mission. That is recorded, and the mission stays open until the deadline.
- **Apple's swipe-up / system dismissal can't be blocked.** Terbit MY doesn't try to intercept, disable or override any system control or gesture.
- **Terbit MY can't always know why an alarm ended.** AlarmKit doesn't report fires or dismissals to apps. Taps on Stop and the Terbit button are recorded by App Intents. Other system dismissals run no Terbit code, so the fire is worked out from the schedule when the app next opens, and the morning ends as incomplete unless the mission is done. A system dismissal never counts as a completed mission.
- **Unlocking (Face ID / passcode) is controlled by iOS** before the app opens from the lock screen.
- **AlarmKit requires iOS 26 or later.** The Terbit button uses the iOS 26.1+ alert API; there's no native alarm before iOS 26.
- **Snooze is intentionally undecided** and isn't implemented. It will be tested later **per mode** (Reward, Gentle, Challenge): whether it's allowed, how many snoozes, how long, and whether Challenge has stricter rules.
- **Android Gentle parity and final Android alarm parity are deferred** under the iOS-first strategy. Known Android gaps: no Gentle reminder notification; the alarm sound is a notification sound, not a foreground service; alarms aren't restored before the first unlock after a restart.
- **Free/premium packaging is provisional** and may change during beta (see the table above).
- **Development builds only:** on a development build, a fully closed app may show the Expo developer menu before Terbit MY loads. Release builds don't.

## Phase 2B: Accounts & Cloud Foundation

| Item | Status |
|---|---|
| Optional account; guest/local-only use unchanged; app runs local-only when no Supabase is configured | ✅ Unit-tested |
| Email one-time code sign-in, session restored on restart, sign out (keeps local data) | ✅ Unit-tested against an in-memory cloud · live test deferred to beta |
| Profile (display name, avatar URL, time zone), created at sign-up | ✅ Schema live in Supabase + app · live test deferred to beta |
| Supabase schema: profiles, alarms, alarm_occurrences, xp_ledger, achievements; RLS own-rows-only on every table; cascade delete | ✅ Applied to the live project (12 Oct); SQL checked by tests; manual RLS script |
| Local-first backup sync: pending-by-fingerprint (migration 8 `sync_state`), retries with back-off, idempotent, newest-wins conflicts, alarm tombstones | ✅ Unit-tested (offline, retry, duplicates, conflicts, guest → account) |
| Settings → Account screen: local / sign-in / email, display name, sync status, sign out, delete account; developer sync diagnostics | ✅ Built; local-only view in use · signed-in view deferred to beta |

Live backend checks (12 Oct): project reachable; all five tables and three functions exist; anonymous access refused (RLS + grants working). Public values are in `.env.local` (git-ignored).



## Phase 3A: Education Quiz Missions

Branch `phase-3/education-quiz-missions`. ✅ **Complete and verified on iPhone (12 Oct 2026):** all topics, difficulties and question counts; real alarm → quiz hand-off; feedback and explanations; Education XP once; Challenge bonus; Main Wake-Up rule; persistence after restart.

| Item | Status |
|---|---|
| Quiz mission type: General Knowledge, Geography, Vocabulary, Logic × Easy/Medium/Hard × 3/5/10 questions; Maths unchanged | ✅ Unit-tested |
| Offline curated packs: 156 questions (13 per topic and difficulty), stable IDs, explanations; `QuestionSource` ready for more packs | ✅ Validated by tests |
| Selection avoids recently asked questions (last 300 IDs on the phone) | ✅ Unit-tested |
| One question at a time, instant right/wrong + explanation; completes at any score | ✅ Unit-tested · ✅ Verified on iPhone |
| Result: score, review (question, your answer, correct answer, explanation), XP breakdown, achievements unlocked, morning vs all-alarms note | ✅ Built · ✅ Verified on iPhone |
| XP via central policy: quiz 10 (Education) + difficulty bonus (0/2/5, every mission type) + existing Challenge bonus; awarded once | ✅ Unit-tested |
| Main Wake-Up rule unchanged: non-main quiz alarms earn XP but never touch morning statistics | ✅ Unit-tested |
| Practice screen for quizzes; development builds: switch topic/difficulty, “fixed set” | ✅ Developer-only |

No database migration (missions are stored as JSON). Existing Maths alarms and history are unchanged.

## Phase 3B: Fitness Missions

Branch `phase-3/fitness-missions`. ✅ **Complete and verified on iPhone (12 Oct 2026):** rep missions and targets, too-fast tap protection, timed missions with pause/resume and accurate background timing, real alarm → fitness hand-off, Fitness XP once, Main Wake-Up rule, persistence after restart.

| Item | Status |
|---|---|
| Fitness mission type: Push-ups, Squats, Jumping jacks (rep-based); Stretch, Walk in place (timed); Easy/Medium/Hard | ✅ Unit-tested |
| Reusable rep and timer building blocks: 3 s countdown; one deliberate tap per rep (too-fast taps ignored); timer from timestamps (background-safe), pause/resume; abandon = existing skip/give up | ✅ Unit-tested · ✅ Verified on iPhone |
| Targets and anti-tap limits central in `fitness/exercises.ts` (prototype values) | ✅ |
| Marked self-reported everywhere (editor, mission, result, history); no camera or pose detection in 3B (optional camera counting for push-ups and squats: Phase 4.5) | ✅ |
| Fitness XP via central policy: 10 + difficulty bonus + existing Challenge bonus; awarded once; Fitness rank; "First Fitness mission" achievement | ✅ Unit-tested |
| Main Wake-Up rule unchanged: non-main fitness alarms earn XP and count in All alarms only | ✅ Unit-tested |
| Accessibility groundwork (replaced in 3D by Mobility Profile catalogues) | ✅ |
| Practice for every mission from the Alarms tab; development builds can launch any type/exercise/difficulty directly | ✅ |

No database migration (missions are stored as JSON). Maths and Quiz unchanged.

## Phase 3C: Faith Missions

Branch `phase-3/faith-missions`. ✅ **Built and verified on iPhone (12 Oct 2026)**: Recitation, Reflection and Recitation + Reflection alarms, XP once, Recitation-only archive, same-day Reflection rotation, silent-switch playback and audio focus, offline/fallback, persistence, and Recitation paging with the current-page progress bar. Design and rules: [docs/FAITH-CONTENT.md](docs/FAITH-CONTENT.md), [docs/REFLECTION-MUSIC.md](docs/REFLECTION-MUSIC.md).

| Item | Status |
|---|---|
| Faith preference (6 choices) in Settings → Faith; works for guests; private (never social/public/analytics); synced to the private profile only when signed in | ✅ Unit-tested · Supabase column needs the new SQL (below) |
| “Explore other faith traditions” (default OFF), separate from the primary preference | ✅ Unit-tested |
| Faith missions in the alarm editor (Faith → Recitation / Reflection / Both); default follows the preference | ✅ Built |
| Recitation + Reflection: one occurrence, Recitation then Reflection, one Faith reward; a single stage can’t complete it | ✅ Unit-tested |
| Several Reflections a day: first is today’s session, later ones are fresh alternates from earlier days (no repeat in a row, no Reflection history) | ✅ Unit-tested |
| Daily Recitation: one per tradition per local date, Terbit-owned layered schedule (history never changes), future dates refused | ✅ Unit-tested |
| `FaithContentProvider` abstraction; text stored/shown exactly (checksum-protected cache); review states draft → approved | ✅ Unit-tested · **development fixtures only (placeholder text, not scripture)** |
| Recitation flow: Begin → pages with progress → confirm (self-reported, no microphone); transliteration/translation display settings, translation always one tap away | ✅ Unit-tested |
| Offline first: today’s and tomorrow’s passage prefetched; alarm missions never wait on the network; local fallback passage | ✅ Unit-tested |
| Recitation archive (last 30 days, Recitation only): needs internet the first time, then saved | ✅ Unit-tested |
| Reflection / Meditation for everyone: daily theme + prompts + track, settle → prompts → closing intention, Easy 45 s / Medium 2 min / Hard 4 min (central policy), pause/resume | ✅ Unit-tested |
| `ReflectionMusicProvider`: bundled/cached → download → stream (archive purpose, unused by screens) → bundled fallback; licence metadata; placeholders never production-approved | ✅ Unit-tested |
| iOS audio: plays in silent mode, pauses other apps’ audio, continuous under prompts, no background audio, no microphone | ✅ Built · needs iPhone test |
| Faith XP for both (once, Faith Rank, Total XP, restart-safe), Challenge bonus, Main Wake-Up rule, “First Faith mission” | ✅ Unit-tested |
| Developer tools (practice screen): tradition, test date, theme, duration (incl. 15 s test), force offline, force fallback music, prepare now | ✅ Developer-only |

**Changes needing action:** new native packages `expo-audio`, `expo-file-system`, `expo-asset` → **new iOS development build required**. SQLite migration 9 (`faith_content_cache`, automatic). Supabase: run `supabase/migrations/20261012120000_faith_preference_and_reflection_music.sql` and upload the three placeholder tracks (see docs/REFLECTION-MUSIC.md). Android: no work done (deferred).

## Phase 3D: Settings, Permissions & Accessibility

Branch `phase-3/settings-permissions-accessibility`. ✅ **Built and verified on iPhone (12 Oct 2026)**: Settings index, Permissions (real status, Open iPhone Settings), Gentle follow-ups automatic for Gentle only, Mobility Profile catalogues with equal XP, Extended pacing, Reduce Motion and Larger Text followed as iPhone preferences (not permissions), persistence, alarms unchanged. UX map: [docs/UX-INVENTORY.md](docs/UX-INVENTORY.md).

| Item | Status |
|---|---|
| Settings index: Account · Alarms & missions (Faith) · Notifications · Accessibility · Privacy & data · Developer (dev builds only) · About; current value under each row; placeholder pages removed | ✅ Unit-tested (routes exist, no duplicates, dev hidden) |
| Permissions: alarms + notifications status as reported (unknown never shown as allowed), Allow (only if never asked), Open iPhone Settings; audio needs none; microphone/camera not used and never requested | ✅ Unit-tested |
| Reminders: alarm-critical explained; Gentle follow-ups are part of Gentle mode (no switch; Reward and Challenge never send one); planned optional notifications listed, not switchable | ✅ Unit-tested |
| Mobility Profile (Standard / Reduced mobility / Non-physical), a personal setting (onboarding-ready). Each profile has its own Fitness catalogue; Non-physical: controlled breathing, number focus, hold and release, grounding (not exercise). Same XP at the same difficulty | ✅ Unit-tested |
| Mission pacing Normal / Extended (Fitness “get ready” 3 s → 10 s; targets unchanged) | ✅ Unit-tested |
| Reduce Motion: fade transitions; large text: stacked rows, list choices, capped display numbers | ✅ Built |
| Your data (privacy) screen; Developer tools consolidated | ✅ Built |

**Changes needing action:** a small native addition (reading the notification permission, `getReminderPermissionAsync` in the TerbitAlarms module) → **new iOS development build required** (until then the Permissions screen says notifications “can’t check on this version”). No new packages, no migration, no Supabase change. Android: no work done (deferred).

**Open product decision (not changed in 3D):** fully non-physical activities currently earn **Fitness XP** (and count toward the Fitness rank), so accessibility choices aren’t penalised. Whether they should be named or counted differently (e.g. a neutral “Wellbeing” discipline) is a later product/UX decision.

## Phase 3.5: Core UX Consolidation

Branch `phase-3/core-ux-consolidation`, merged into `main`. ✅ **Complete and verified on iPhone (13 Oct 2026).** Verified on the iPhone:
- Today shows active alarms only; deleted alarms leave Today while Progress, XP and streak history stay.
- Main Wake-Up replacement: a full overlap deletes the old alarm; a partial overlap keeps its other days; weekday and weekend Main Wake-Ups coexist.
- Today, the weekly schedule and Manage agree.
- Completion windows: Reward 2 h, Gentle same day, Challenge 1 h. Completed missions open the editor.
- Native snooze works and survives opening Terbit; replacing or deleting cancels obsolete snoozes.
- Next alarm is correct; state persists after a restart; there is no duplicated XP or history.

Not the final visual redesign. Details: [docs/UX-INVENTORY.md](docs/UX-INVENTORY.md).

| Item | Status |
|---|---|
| Today as the daily home: morning status (Main Wake-Up only), next alarm from the real schedule, today's alarms in time order with status, daily practice, streak / today's XP / rank snapshot | ✅ Unit-tested |
| Mission-first alarm creation: category → mission (Mobility Profile and Faith filtering) → time → Save Alarm or Customise | ✅ Unit-tested |
| Central default policy `ALARM_DEFAULTS` (Reward, Easy, 3 questions, Monday–Friday, snooze every 10 min up to 3 times). Never Main Wake-Up by default | ✅ Unit-tested |
| Morning window (prototype 03:00–11:00, `features/alarms/morning.ts`; later personalised in onboarding / Morning Routine). A new morning alarm asks: "Make this your Main Wake-Up?" (none yet), or "Replace Main Wake-Up" / "Keep existing Main Wake-Up" (→ one-off) | ✅ Unit-tested |
| One-off morning alarms: ring once, turn themselves off, tagged "One-off" on Today, leave Today once done, never affect the streak | ✅ Unit-tested |
| Main Wake-Up snooze: interval (5/10/15 min) + maximum snoozes (1/2/3/5), "Preview schedule". **Real iOS snooze**: the alarm shows Snooze until the last allowed ring (which shows the mission button); each snooze ring is scheduled natively by an App Intent (no JavaScript), from the same offsets as the Preview. All rings are one morning (snooze count recorded); Today shows one row ("Snoozed · next ring 06:40") | ✅ Verified on iPhone |
| Customise: the editor with progressive disclosure (`missionControls`), reordered time → mission → mode → repeat → label / Main Wake-Up | ✅ Unit-tested |
| Manage alarms (Alarms tab), grouped by mission then time; editing from Today; tapping an unfinished morning on Today resumes its mission first | ✅ Unit-tested |
| One Main Wake-Up per calendar day, from ONE resolver (`resolvedMainWakeUp`): weekday and weekend Main Wake-Ups allowed; overlaps ask (partial: only those days move; full: the old alarm is deleted, history kept); one-off date override; older overlapping data fixed on load without deleting | ✅ Unit-tested |
| Consistency pass: Today built from active saved alarms (occurrences add state only; no ghost rows after delete); central completion windows (Reward 2 h, Gentle same day, Challenge 1 h); central row action (resume only while resumable); deletion cascade (native alarm, snoozes, Gentle reminder; history kept); weekly schedule screen; Next alarm ignores deleted / off / rung one-offs | ✅ Unit-tested |
| Recent mornings moved to Progress (navigation only, no data change); Sleep placeholder removed | ✅ Unit-tested |
| Shared result layout (Success → summary → Reward → Progress → Action) for alarms and Practice; rank-ups shown; a real alarm returns to Today | ✅ Unit-tested |
| Creation flow ready for a Morning / Day / Night step (`CREATION_STEPS`, `RoutineContext`); nothing about routines shown | ✅ Architecture only |

**Changes needing action:**
- **New iOS development build required**: native snooze. Changed Swift: `AlarmKitBridge.swift`, `AlarmIntents.swift` (new `TerbitSnoozeIntent`), `NativeAlarmRecords.swift`, `TerbitAlarmsModule.swift`, and new `NativeSnooze.swift`. No new packages.
- SQLite migrations 10 (`alarms.snooze_max`) and 11 (`alarm_occurrences.snooze_count`), applied automatically.
- Snooze fix after the first iPhone test: re-scheduling a saved alarm (which the app does when it opens) no longer cancels a pending snooze ring natively; only turning the alarm off or deleting it does, or the app when the morning is finished or the alarm no longer matches the ring.
- No Supabase change (the cloud stores alarm snooze as JSON; the snooze count stays on the phone).

**Snooze limitations (iOS AlarmKit):**
- An alarm alert has the system Stop plus ONE custom button. While snoozes remain, that button is Snooze, so "Stop & Open Terbit / Start Mission" appears only on the last allowed ring (or with snooze off). To start the mission earlier, tap Stop and open Terbit MY.
- If Snooze is tapped after the next planned time has already passed (the ring was left going), the next ring is one interval from the tap.
- Scheduling each ring relies on iOS running Terbit MY's Snooze App Intent in the background (it does so even when the app is closed or the phone is locked). If AlarmKit refuses, no further ring is scheduled; this is recorded as `snooze_failed`.
- Apple's built-in countdown snooze wasn't used: it needs a Live Activity widget extension and can't enforce a maximum.

**Future work (documented, not started):**
- **Onboarding and personalisation:** weekday and weekend wake times, snooze preference, Faith, Mobility Profile, Education and Fitness interests, accountability preferences. These would set `ALARM_DEFAULTS` and the Morning window per user.
- **Routine selection:** Morning / Throughout the Day / Night when creating an alarm, and as sections in the weekly schedule. The structure is ready (`CREATION_STEPS`, `RoutineContext`, `sectionOf`).
- **AlarmKit limitation:** a one-off Main Wake-Up override can't yet silence that day's repeating native alarm. It still rings, but isn't the Main Wake-Up and doesn't count as the morning.
- **Final visual/UI redesign** (3.5 consolidated structure, not visuals).
- **Final Faith content placement.**
- **Naming decision:** whether non-physical activities keep earning Fitness XP, or get a neutral name such as "Wellbeing".
- **Camera-verified Fitness missions:** Phase 4.5 covers push-ups, squats, jumping jacks and chair sit-to-stand. Wall push, step-out, walk in place and seated marching are later candidates.

## Phase 4.5: Camera-Verified Fitness Missions

Branch `phase-4.5/camera-fitness-verification`, merged into `main`. ✅ **Complete and physically verified on iPhone (13 Oct 2026)** in the `development-screen-time` build `d017a751`.

**Final record:**
- **Technology:** Apple Vision body pose (iOS), in the local `modules/terbit-pose` module.
- **Privacy:** processed on the phone only. No photo or video recording, no saved or uploaded frames, no network or Supabase processing, no account needed. The microphone isn't used.
- **Optional:** "Verify with camera" is optional, and tapping (manual) is always available. Camera progress carries over if you switch to tapping.
- **XP:** the same XP for camera and manual completion. `camera_verified` is recorded only when the whole target was completed through camera recognition.
- **Verification:** multi-signal evidence (weighted primary and secondary paths, any camera angle where the evidence allows).
- **Start and guidance:** automatic Ready → countdown → Go (no tap); live positioning, movement and slow-down guidance.
- **Supported:** push-ups, squats, jumping jacks, chair sit-to-stand.
- **Future candidates:** wall push, step-out movement, walk in place, seated marching. Timed and static activities (stretches) and the whole Non-physical profile stay non-camera.
- **Deferred:** the Android camera implementation (Phase 7) and any Challenge-mode camera requirement (future work).

**Verified on the iPhone:**
- The camera permission flow works, and `TerbitPose` loads.
- The automatic Ready and countdown work without walking back to the phone.
- Push-ups count reliably from the supported positions with acceptable leniency, and "Lower a little more" helps.
- Squats and jumping jacks work smoothly.
- There are no obvious phantom reps. Fast movements either count or get the slow-down prompt, and partial movements are rejected.
- Leaving the frame keeps completed reps. The manual fallback keeps camera progress.
- XP and completion happen exactly once.
- Manual Fitness missions, Night Routine, Main Wake-Up, snooze, XP and streak, and guest/local-first behaviour are all unaffected.
- Chair sit-to-stand is fully unit-tested, but wasn't part of the reported physical run; a quick check later is advised.

**Purpose:** accountability ("did you genuinely get up and do it?"), not competition-form judging. Ten normal genuine reps should give about 8–10 counted. Small fake motions, jitter and moving an irrelevant body part shouldn't count. Camera verification is always optional; tapping always remains, with the same XP.

**Catalogue audit (every activity classified, `CAMERA_CATALOGUE` in `pose/camera-activities.ts`):**

| Profile | Activity (mission kind) | Camera | Why |
|---|---|---|---|
| Standard | Push-ups (reps) | ✅ Enabled | Clear elbow cycle; shoulder + hip lowering as a second path |
| Standard | Squats (reps) | ✅ Enabled | Clear knee cycle; hip lowering with knees or shoulders as a second path |
| Standard | Jumping jacks (reps) | ✅ Enabled | Closed → open → closed of arms AND legs |
| Standard | Stretch (timed) | ❌ Not suitable | Static and varied: friction or form policing |
| Standard | Walk in place (timed) | ⏸ Later | Needs continuous-movement verification (alternating legs, active time), not reps |
| Reduced mobility | Wall push (reps) | ⏸ Later | Like a push-up, but inclusive ranges need testing first |
| Reduced mobility | Chair sit-to-stand (reps) | ✅ Enabled (forgiving) | Large, unmistakable hip and knee movement; starts seated or standing |
| Reduced mobility | Step-out movement (reps) | ⏸ Later | Alternates sides and may be seated: "one rep" varies; needs its own testing |
| Reduced mobility | Seated stretch (timed) | ❌ Not suitable | Static |
| Reduced mobility | Seated marching (timed) | ⏸ Later | Continuous-movement verification (alternating knee lifts) |
| Non-physical | Breathing, Number focus, Hold and release, Grounding | ❌ Never | Non-physical profile: never camera |

| Item | Status |
|---|---|
| Pose technology: **Apple Vision** body pose in the local module `modules/terbit-pose` (AVFoundation + Vision, iOS). About 15 frames a second at 640×480; late frames dropped; only 12 joints reach JavaScript | ✅ In build `d017a751` (binary checked) |
| **Shared verification engine** (`pose/verifier.ts`): exercise-specific readiness; stable side; confidence filter; light smoothing (2 unsmoothed frames also count); multi-signal weighted evidence; movement states; partial-rep hints; glitch / too-quick / natural speed tiers; stillness for the automatic start; temporary-loss handling; reps never lost | ✅ Unit-tested · ✅ push-ups, squats, jumping jacks completed on iPhone |
| Automatic start: hold still ~1 s → Ready · 3 → 2 → 1 → Go (no Start button); losing the pose cancels the countdown | ✅ Unit-tested · ✅ Verified on iPhone |
| Activities (`pose/camera-activities.ts`): push-ups, squats, jumping jacks, chair sit-to-stand, each with evidence paths, minimum landmarks, timing, positioning text and live phrases | ✅ Unit-tested · ✅ push-ups, squats, jumping jacks verified on iPhone |
| Live feedback: neutral and actionable (e.g. "Lower into the push-up", "Keep going", "Good — push back up", "Lower a little more", "Rep counted"); never "bad form" or "incorrect" | ✅ Unit-tested |
| Same mission rules: camera reps go through `recordCameraRep` (active only, completes once; the activity's own minimum cycle); `camera_verified` only if every rep was camera-counted; switching to tapping keeps the reps so far (result: self-reported) | ✅ Unit-tested |
| Same XP as tapping; stored in the existing result JSON (no migration) | ✅ Unit-tested |
| Permission, fallback, privacy, offline: one camera permission for all activities; "Continue without camera" everywhere; on-device only; no recording or upload | ✅ Unit-tested (rules + source checks) |
| Availability states ("Not in this build" / "Not asked yet" / "Not available on this phone" / "Can't check"), and the developer panel (Settings → Developer tools → Camera rep counting) | ✅ Unit-tested |

**First iPhone run (13 Oct 2026), resolved:**
- Settings showed the camera as unavailable, and no camera prompt appeared.
- The developer panel showed the phone was running the **previous** Screen Time build `7f5805f1`: native modules were `TerbitAlarms` and `TerbitScreenTime`, with no `TerbitPose`.
- Downloading both builds' binaries confirmed it:
  - `d017a751` contains `TerbitPoseModule`, `PoseCameraView` and the camera purpose string;
  - `7f5805f1` contains none of them.
- **Fix:** install `d017a751` over the old app (don't delete it first, or local data is lost). No code fault.
- The availability states were also separated (module / hardware / permission), so a failed check can never again look like "no camera on this phone".

**Physical tuning pass (13 Oct 2026), after testing push-ups, squats and jumping jacks on the iPhone:**
- **Results:** all three complete. Squats and jumping jacks were recognised almost immediately front-facing. Push-ups worked best front-facing (12 o'clock), but needed almost chest-to-floor depth. Very fast reps were occasionally missed. Walking back to the phone to tap Start lost the full-body framing.
- **Push-ups (depth):** a new primary path, *shoulder height above the hands in forearm lengths* (reads the same from the front, side or an angle). The depth targets are more lenient: elbow ≤120° (was 105°); lowering ≤1.5 forearms (≈ a 120° elbow). The side-on fallback without an elbow is a little more lenient too.
  - **Root cause:** from the front, the elbow angle barely changes, and the old backup scaled by torso length, which looks tiny from the front.
  - The start position is now judged by primary paths only, so body proportions can't block "back at the top".
- **Angles:** front-facing, side-on (either side) and angled all work for push-ups and squats; front-facing for jumping jacks; side-on or angled for sit-to-stand. The verifier adapts automatically (no mode to choose).
- **Speed:**
  - a cycle under 0.2 s is a detector glitch, ignored silently;
  - a plausible movement that's too quick to verify (below the activity's minimum, or the target only glimpsed for one frame) says **"A little slower so I can count the full movement"**;
  - a quick movement whose unsmoothed value holds the target for 2 frames now counts.
  - Minimum measured cycle: push-ups and squats 0.35 s, jumping jacks 0.25 s, sit-to-stand 0.8 s (was 1.2 s; measured cycles are ~0.6 of the real time).
- **Automatic start (no tap):** hold the activity's pose still for ~1 s → "Ready · 3" → 2 → 1 → "Go" → counting. Losing the pose during the countdown cancels it. After Go, movement never cancels anything. Leaving mid-set keeps the reps, and counting resumes after a short "Hold there" (no new countdown).
- **Positioning:** what worked on the iPhone, plus one clear fix at a time ("Step back a little — keep your feet in frame", "Keep one arm visible", "Keep your arms in frame", "Move into view").

**Changes needing action:** none beyond installing build `d017a751`. This round's framework is JavaScript only. No SQLite or Supabase migration; no new packages.

**Known limits (prototype):**
- Thresholds are provisional, to be tuned with the per-activity iPhone protocols.
- Front camera and portrait only; no skeleton overlay.
- Push-ups need one arm visible side-on (or shoulder, wrist and hip). Jumping jacks need the user facing the phone with arms and legs in frame.
- Poor light, very loose clothing or a cluttered background can stop detection. Terbit then shows a positioning hint and doesn't count.
- iOS only. Android can later feed the same joint format to the same engine.

**Future (documented, not built):**
- Camera candidates deferred for reliability testing: wall push, step-out movement, walk in place and seated marching (continuous-movement mode).
- **Challenge mode:** `camera_verified` is recorded, so a later rule could make the camera recommended or required, or show a verified badge. Not in 4.5; XP stays the same.

## Phase 5A: Live Accounts & Sync Verification

Branch `phase-5/accounts-live-verification`, merged into `main`. ✅ **Complete on the repository side (13 Oct 2026).** The account, sync, session, offline and RLS architecture is built, unit-tested and probed against the live project. Details: [docs/CLOUD.md](docs/CLOUD.md) → "Phase 5A".

**Owner decision (13 Oct 2026): live email verification is deferred to beta, intentionally.** The public name and domain aren't final, so no domain is bought, no custom SMTP or branded templates are set up, and no end-to-end OTP email test is done now. This isn't a blocker. Every deferred item is listed under "Beta requirements" → "Accounts & email live verification".

| Item | Status |
|---|---|
| Audit of Phase 2B: email one-time code, profile, RLS, sync scope (profile, alarms, occurrences, XP, achievements; Night Routine phone-only), backup-only (no restore) | ✅ Done |
| Live project probe: anonymous access refused on every table and function; both migrations applied; no Night Routine or sync state in the cloud | ✅ Done (13 Oct) |
| Offline with an expired token: stays signed in (read from the saved session) instead of looking like a guest; start-up event no longer signs the user out | ✅ Fixed · unit-tested |
| "Sign-in required" when Supabase ends the session (not after a deliberate sign-out) | ✅ Unit-tested |
| Sync status: Sync pending, Synced · Last synced (survives restarts), Offline · N changes waiting, Sign-in required, Sync failed; no raw errors (developer panel keeps them) | ✅ Unit-tested |
| Sign-in messages in plain words (offline, rate limit, address not authorised, wrong code) | ✅ Unit-tested |
| Account screen: "Continue without an account" / "Sign in / Create account (optional)" | ✅ Built |
| Lifecycle test: guest data → sign in → sync twice → restart → sign out → guest use → sign in → offline change → reconnect; no duplicate alarm, Main Wake-Up, occurrence, XP or achievement | ✅ Unit-tested |
| No secrets in committed files; `.env.local` ignored | ✅ Unit-tested |
| Live sign-in, guest → account, sync, sign-out, offline on iPhone | ⏸ Deferred to beta (owner decision) |
| Two-account live RLS check (`supabase/tests/rls_check.sql`) | ⏸ Deferred to beta (anonymous access already refused live) |

**What is verified without live email:** anonymous access is refused on every live table and function, and both migrations are applied (live probe). Sign-in, profile, guest → account, idempotent sync, sign-out, offline, expired-session and "Sign-in required" behaviour are unit-tested against an in-memory cloud with the same rules as the schema. Guests never call the cloud, so the shipped app works fully without accounts.

**Changes needing action:** none. No new packages, no native code, no SQLite or Supabase migration. The installed development build is enough (JavaScript only).

**Known limits (documented, not in 5A):** restoring onto a new phone isn't built (backup only); a second account signing in on the same phone also receives this phone's data; custom SMTP and branded email wait for the final name and domain (beta).

## Phase 5B: Circles Foundation

Branch `phase-5/circles-foundation` (from `main` at `8ff1b5a`), merged into `main`. ✅ **Complete (14 Oct 2026):** the migration is live, both live SQL checks pass, and the signed-out state is verified on iPhone. Signed-in, account-dependent tests are deferred to beta by owner decision. Details: [docs/CLOUD.md](docs/CLOUD.md) → "Circles (Phase 5B)", [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → "Circles".

Scope: membership infrastructure only. **Not in 5B:** feed, check-ins, Main Wake-Up sharing, reactions (old 5C); push notifications (old 5D); both now superseded, see docs/ROADMAP.md; chat, leaderboards, streak competitions, public discovery, contacts. Nothing about alarms, missions, XP, streaks, camera, Night Routine or Faith is shared.

| Item | Status |
|---|---|
| Migration `supabase/migrations/20261013120000_circles_foundation.sql`: `circle_identities`, `circles`, `circle_members`, `circle_invites`, `circle_join_failures`; constraints, indexes, RLS, column-level grants, 5 client functions | ✅ Applied on the live project · live schema check `supabase/tests/circles_live_verify.sql`: **"ALL CHECKS MATCH THE REPOSITORY"** (14 Oct; 2B/5A tables, policies, functions and sign-up trigger unchanged) |
| Shareable identity separate from the private profile (display name only; never `profiles`, Faith, time zone or email) | ✅ Unit-tested + SQL-checked |
| Create (creator = the one owner row), multiple Circles, duplicate names allowed, rename, delete (dissolve) | ✅ Unit-tested + SQL-checked |
| Join by 8-character invite code (40 random bits, 7-day expiry, one current code per Circle, new code replaces the old); preview shows the name only; joining twice is not a duplicate; 50-member cap | ✅ Unit-tested + SQL-checked |
| Basic brute-force protection: 10 wrong codes per 15 minutes per user, then refused | ✅ SQL-checked |
| Owner/member rules: members leave; the owner can't leave (deletes instead; transfer later) | ✅ Unit-tested + SQL-checked |
| Security check `supabase/tests/circles_rls_check.sql`: signed out, non-member, member, owner, Faith privacy, cascades, with 3 throwaway users and no email; everything rolled back | ✅ Passes against a local Postgres (PGlite) with Supabase-like roles; 6 deliberately broken rules were each caught · ✅ **passes on the live project** ("All Circles security checks passed", 14 Oct) |
| Circles tab: signed out, unavailable, loading, first-time name prompt, list, empty, offline, error; Create; Join; Detail (members, role, invite + share sheet, rename, delete, leave); edit name | ✅ Built · signed-out state ✅ verified on iPhone (14 Oct: sign-in message, link to Settings → Account; alarms, missions, Progress, Night Routine and camera verification unaffected); signed-in screens ⏸ beta |
| Offline: last known list and members cached on the phone (cleared at sign-out); never fetched at start-up; alarms and everything else unaffected | ✅ Unit-tested |
| Plain-language errors (developer builds add the technical detail in brackets) | ✅ Unit-tested |
| Live account-dependent Circles tests (sign-in, create, join, members, leave/delete, offline cache, two accounts) | ⏸ Deferred to beta with the live-email checks (owner decision); the rules are covered now by unit tests and the SQL security check. List: "Beta requirements" → item 8 |

**Closing 5B (owner decision, 14 Oct 2026): live email sign-in is NOT required.**
- **Done before merge (14 Oct 2026):**
  1. Migration applied to the live project: ✅
  2. `supabase/tests/circles_rls_check.sql` on the live project: ✅ "All Circles security checks passed".
  3. `supabase/tests/circles_live_verify.sql` (read-only) on the live project: ✅ "ALL CHECKS MATCH THE REPOSITORY". The migration is applied once and matches the repository; the 2B/5A tables, policies, functions and sign-up trigger are unchanged.
  4. Anonymous access denied: ✅ live probe (every Circles and backup table and function).
  5. Full repository checks: ✅ (`npm ci`, `npm run check`, Expo Doctor, iOS export).
  6. iPhone, no account: ✅ Circles tab while signed out.
- **Deferred to beta:** every live, account-dependent Circles test (Beta requirements → item 8).

**Changes needing action:** none (the SQL setup is done; steps kept in [docs/CLOUD.md](docs/CLOUD.md) → "Circles (Phase 5B)" → Setup). No new packages and no native code: **the installed development build is enough** (JavaScript only). The share sheet uses React Native's built-in `Share`.

**Decisions:** the owner can't leave a Circle (they delete it instead), because silently making someone else owner or deleting a group on "Leave" would surprise members; ownership transfer is a later addition. Deleting an account deletes the Circles it owns (database cascade). The Circles display name is separate from the private account display name and isn't copied from it.

## Phase 4: Bedtime & Restrictions (Night Routine)

Branch `phase-4/bedtime-restrictions`, merged into `main`. ✅ **Complete and verified on iPhone (13 Oct 2026)** in the `development-screen-time` build. Verified on the iPhone:
- Screen Time authorization works, and the status becomes Allowed.
- Apple's Family Activity Picker works. Terbit MY keeps only the opaque selection and counts.
- Chosen apps are shielded at wind-down, before bedtime, with Terbit MY fully closed. Bedtime starts no second restriction event.
- Today shows "Wind-down active" and the restriction end time.
- "End tonight's restrictions" removes the shield and keeps the Night Routine. Restrictions return on the next scheduled night.
- Restrictions lift automatically at the Main Wake-Up with Terbit MY closed.
- The Night Routine persists across restarts.
- Main Wake-Up, snooze, mission XP and streak still work.
- The Sleep Focus guidance and notification wording don't claim control Terbit MY doesn't have.

The Night Routine works in any build. App restrictions need the `development-screen-time` build (normal builds say "Not in this build").

| Item | Status |
|---|---|
| Night Routine model in one place (`features/night/night-routine.ts`): nights, wind-down (restrictions start here: `restrictionStartTime`, no separate setting), bedtime, end rule (Main Wake-Up or fixed time) with a fallback morning time, Apple's opaque app selection, optional calming activity, wind-down reminder. Central defaults (`NIGHT_ROUTINE_DEFAULTS`) and `nightRoutineFromAnswers` for future onboarding | ✅ Unit-tested |
| Time rules (`night-timeline.ts`): a night belongs to its evening; times before noon are the early morning after; bedtime after midnight; weekday and weekend wake-ups; local calendar arithmetic | ✅ Unit-tested |
| Restrictions end at the next morning's Main Wake-Up (`resolvedMainWakeUp`); with no Main Wake-Up, at the fallback time (Today says "no morning wake alarm is scheduled") | ✅ Unit-tested |
| Restriction state: inactive / unavailable / scheduled / active / overridden / ended | ✅ Unit-tested |
| Restrictions start at WIND-DOWN, not bedtime: model, time rules, Tonight, weekly line, wind-down reminder and the native DeviceActivity interval (shield applied at interval start). Routines saved with an old separate restriction start are read safely and now restrict from wind-down | ✅ Unit-tested · ✅ Verified on iPhone |
| Setup and editing (Alarms → Routines → Night Routine): wind-down, bedtime, apps, optional activity, Save; Customise for nights, end rule and reminder | ✅ Built |
| Notifications: Terbit MY doesn't claim to block other apps' notifications or turn on Focus (Apple has no API for either). The "Quiet notifications" section optionally suggests Sleep Focus at the same time as wind-down | ✅ Unit-tested (copy + screen scan) |
| Available Sleep Window (bedtime → relevant Main Wake-Up; not sleep): helper and terminology only, nothing shown, no usage data collected | ✅ Unit-tested |
| Today → Tonight: "Wind-down begins · Apps restricted" → Bedtime → "Main Wake-Up tomorrow · Restrictions end"; shown first during wind-down and the night; "Tonight · Wind-down active", then "Tonight · Bedtime", with "Apps restricted until …" throughout; calming activity offered during wind-down | ✅ Unit-tested |
| Weekly schedule: one Night Routine line per evening it applies to | ✅ Unit-tested |
| Wind-down reminder (one local notification per evening, the next 7 evenings, refreshed when Terbit MY opens) | ✅ Unit-tested |
| Screen Time (iOS): authorization, Apple's picker, ManagedSettings shields, DeviceActivity schedules, Device Activity Monitor extension | ✅ Verified on iPhone (`development-screen-time` build, 13 Oct 2026) |
| "End tonight's restrictions" (deliberate, confirmed; back automatically the next night) | ✅ Unit-tested |
| Settings → Screen Time access (status and recovery); Permissions and Your data explain it | ✅ Built |

**Apple entitlement status: ✅ APPROVED (13 Oct 2026).**
- **Approved:** Family Controls (Distribution) for both `com.terbitmy.app` and the extension `com.terbitmy.app.activity-monitor`.
- **Portal (confirmed by the owner):**
  - App Group `group.com.terbitmy.app` is attached to both identifiers.
  - Team ID `663JDC7J6J` is set in `eas.json` (`development-screen-time` profile only).
- **Why Distribution was needed:** Family Controls (Development) works only with *development* provisioning profiles (Xcode builds). EAS internal builds use *ad hoc* profiles, which need the Distribution capability (expo/eas-cli #2715, #3185). Without a Mac, Distribution approval was the only route.
- **Build switch (still in place, by design):**
  - Only `development-screen-time` sets `TERBIT_SCREEN_TIME=1`. It adds the entitlement, the App Group and the extension.
  - The normal `development` profile is unchanged and has no Screen Time. Those builds report "Not in this build", and the Night Routine still works.
- **Screen Time build:** `npx eas-cli@latest build --profile development-screen-time --platform ios`. The first build finished on 13 Oct 2026 and was used for the iPhone verification. EAS holds the credentials for both targets.
- **Production / TestFlight** builds will also need the switch (Phase 6H, before beta).

**Changes needing action:**
- New native code: the TerbitScreenTime module is compiled into every build. The extension is added only in `development-screen-time` builds. **A new iOS development build is required** to get the module.
- New package `@bacons/apple-targets` (a config plugin by an Expo team member; it is only applied when the switch is on).
  - `package.json` `overrides` makes it use the project's SDK 57 `@expo/prebuild-config` instead of the SDK 55 copy it pins (`~55.0.6`). That old copy declared a TypeScript 5 peer, so `npm ci` on EAS (npm 10.9.8) failed with "Missing: typescript@5.9.3 from lock file". The plugin only uses `writeContentsJsonAsync`, identical in both versions. Remove the override once apple-targets supports SDK 57.
- SQLite migration 12 (`night_routines`), applied automatically.
- No Supabase change: the Night Routine is not backed up.

**Expo project (do not change):**
- Terbit MY is linked to `@arifrhmn3/terbit-my` (ID `db6aa5b6-4442-4246-98d1-c1291806f69d`, in `app.json`).
- A duplicate team project, `@arifrhmn3s-team/terbit-my` (ID `8363cdad-041c-4a6e-bd12-764116b82173`), is connected to GitHub and may start unwanted production builds.
- **Owner to do:** on expo.dev, open the duplicate team project → GitHub → disconnect the repository. Don't change the local project ID.

**Not in Phase 4 (future work, documented):**
- Sleep Focus setup helper via App Shortcuts / Shortcuts (the user sets it up once; Terbit MY never claims to turn on a Focus itself).
- Available Sleep Window analytics (the helper exists; no charts or sleep scoring yet).
- Possible Apple Health sleep integration (the only route to actual sleep data).
- Onboarding and personalisation (done in Phase 6A).
- More camera-verified activities (Phase 4.5 covers push-ups, squats, jumping jacks and chair sit-to-stand): wall push, step-out, walk in place, seated marching.
- Android parity (Phase 7).
- Final UI redesign.
- Circles (Phase 5).

**Known Apple limitations:**
- Restrictions are a commitment aid, not a lock. The user can always remove Terbit MY's Screen Time access in iPhone Settings, or end tonight's restrictions in the app. Emergency calls are never blocked by iOS.
- Shields use Apple's standard screen (no custom shield extensions in Phase 4).
- DeviceActivity allows 20 schedules per app. Terbit MY uses at most 7 nightly schedules plus up to 7 one-time "end early" markers.
- A one-off Main Wake-Up *later* than usual doesn't extend restrictions: they end at the usual Main Wake-Up, the safe direction.
- **Notifications:** Apple's Screen Time APIs (FamilyControls, ManagedSettings, DeviceActivity) give Terbit MY no way to silence, suppress or change other apps' notifications.
  - Shielded apps' notifications may be suppressed in practice, but Apple doesn't document it, so Terbit MY doesn't promise it.
  - For a quiet wind-down, Terbit MY recommends an iPhone Focus (e.g. Sleep). See docs/ARCHITECTURE.md.

## Phase 6A: Personalisation & Onboarding

Branch `phase-6/personalisation-onboarding`, merged into `main`. ✅ **Complete and physically verified on iPhone (14 Oct 2026).** Purpose: "Tell us what you want to achieve, and we'll build an accountability routine around you", not "set up another alarm clock". Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → "Personalisation & onboarding"; screens: [docs/UX-INVENTORY.md](docs/UX-INVENTORY.md) → "Personalisation".

| Item | Status |
|---|---|
| Seven steps in the fixed order (about you → goals → mode → time of day → wake-up + snooze → wind-down + bedtime → weekly routine), one full-screen modal `/personalise`, light progress bar | ✅ Unit-tested |
| About you: gender (Woman / Man / Non-binary / Prefer not to say; changes nothing else), Faith (existing 6 choices, private), Mobility Profile (existing 3, plain language) | ✅ Unit-tested |
| Goals per category ("What do you want Terbit to help you achieve?"), any category can be "Not now"; deterministic goal → existing mission policy, Easy; Fitness follows Mobility; Faith follows the preference (reflection language without a tradition) | ✅ Unit-tested |
| Mode per goal, always Gentle → Reward → Challenge (now also in the alarm editor and Settings → Reminders); Challenge 🔒 when not in the plan (Terbit+ later; no purchase) | ✅ Unit-tested |
| Morning / Afternoon / Night per goal; the first Morning goal is the Main Wake-Up mission, others are ordinary alarms after it; never an extra Main Wake-Up | ✅ Unit-tested |
| Weekday + weekend Main Wake-Up (same / different / none), snooze 5/10/15 min × 1/2/3/5 (default 10 × 3) | ✅ Unit-tested, including the central resolver |
| Wind-down and bedtime **targets** saved as personalisation info for everyone; a Night Routine is created or updated only with the explicit "Add / Update my Night Routine" switch (off by default; an existing routine is otherwise preserved). Targets and the Available Sleep Window show in the preview even without a Night Routine | ✅ Unit-tested |
| Terbit+ readiness: every generated item is tagged with why it would need Terbit+ (Challenge, extra alarms beyond the one basic Main Wake-Up, Medium/Hard, premium content, Night Routine), driven by the access policy. Data only: no tags, limits or paywall shown in 6A | ✅ Unit-tested |
| Review: "Your Terbit plan", weekly schedule grouped by days, "What will change", Use this routine / Adjust | ✅ Built |
| Accepting writes real alarms and the Night Routine through the normal stores; reruns update the same alarms (no duplicate alarms, Main Wake-Ups, Night Routine or goal alarms); cancelling changes nothing | ✅ Unit-tested |
| Existing installs never forced (classed once as "existing"); fresh installs offered once at launch; Settings → Personalise Terbit | ✅ Unit-tested |
| Skip per step (warning once per step) and Close (skip everything), with safe defaults; the app is fully usable without it | ✅ Unit-tested |
| Local-only, guest, offline; nothing new synced; nothing visible in Circles | ✅ Unit-tested (source checks) |

**iPhone bug fixed before testing (14 Oct 2026): "Build my Terbit routine" opened a blank, untappable screen.** The screen's own code, data and stores were reproduced as working (rendered with the real stores, real SQLite and existing-user data in a real navigator: no errors). The one native difference was that `/personalise` was the only screen that switched ON a native header (with custom Close/Skip header buttons) inside a full-screen modal; the proven alarm modal has no native header. Fix: the modal now draws its own top bar (Close always, Skip on questions) inside the safe area, like the alarm screen; it has explicit loading ("Preparing your routine…") and error views (Start again / Close), an 8-second open limit, a route error boundary, a clean fallback when a saved session can't be read, and Close returns to where it was opened (Settings). Regression tests render the real screens (`personalise-screen.test.tsx`).

**New storage (no SQL migration):** three JSON values in `app_settings`, phone only:
- `personalisation.state`: audience (new/existing), status, auto-offered, completed at/version, generated alarm ids by slot;
- `personalisation.profile`: gender, goals (goal, mode, part of day, time) and sleep targets (wind-down, bedtime);
- `personalisation.draft`: the unfinished session (deleted when finished or closed).

**Cloud:** nothing new. Gender, goals, sleep targets and personalisation state are never backed up. Faith keeps its existing private-profile backup when signed in. The Night Routine stays local-only. Alarms created by personalisation are ordinary alarms, so they're backed up like any alarm when signed in (unchanged behaviour).

**Changes needing action:** none. No new packages, no native code, no migration: **the installed development build is enough** (JavaScript only).

**Not in 6A:** Bahasa Melayu; Terbit+ purchase/paywall (Challenge, Night Routine and Medium/Hard difficulty are only *ready* for gating in 6F); full notifications; Terbitan; final visual redesign (6B UI Preview loop); Sleep Focus automation (still the documented future idea: recommend Sleep Focus at the same time as wind-down; later App Shortcuts help).

**Decisions:**
- Mode per goal (not one global mode), on one screen with a segmented control beside each goal, so it stays short.
- Gender is a radio list, not a segmented control (four labels are too cramped on an iPhone).
- Weekend "same time" makes one every-day Main Wake-Up; "different" makes two that never share a day; "no alarm" leaves weekends free.
- Afternoon and Night goal alarms ring every day; fine-tuning is in the Alarms tab.
- Sleep targets are separate from the Night Routine (planned Terbit+): continuing through the wind-down step saves targets only; the Night Routine changes only with the explicit switch.
- Planned Free routine: Gentle/Reward, Easy, limited missions, one basic alarm (the weekday Main Wake-Up), no Night Routine. Terbit+: the full routine. 6A still generates and saves the full routine for everyone; three entitlement keys (`multiple_alarms`, `all_difficulties`, `night_routine`) were added for 6F (Terbit+), and nothing checks them yet.
- If the launch check is slower than the usual wait, Today opens and the one-time offer isn't made (Settings still offers it).

**Physical iPhone test passed (14 Oct 2026):** Settings → Personalise Terbit and "Build my Terbit routine" open correctly (no blank screen or navigation trap); the full flow About you → Goals → Modes → Morning/Afternoon/Night → Wake-up/Snooze → Sleep targets → Weekly schedule works; Gentle → Reward → Challenge order is correct; Skip and Close work; sleep targets stay separate from the Night Routine, which changes only when explicitly selected; the generated schedule is understandable and usable; existing alarms and configuration aren't silently overwritten; reruns update generated items without duplicates; the flow feels straightforward and not too long; existing app functionality is intact.

**Preserved future items (not started).** Each now has a home in the canonical roadmap ([docs/ROADMAP.md](docs/ROADMAP.md)):
- UI/UX Design Review with the UI Preview loop → **6B** (next).
- Bahasa Melayu / localisation → **6C**.
- Production Faith sources and APIs, Islam Hadith mission → **6D-A**.
- Education expansion, Daily Crossword, Daily Book Recommendation, progressive learning tracks, source-backed current content → **6D-B**.
- Notifications (Gentle/Reward timing rules) and Terbitan, the midday Circle report → **6E**.
- Terbit+ entitlement and paywall (6A's generated routine is already tagged for it) → **6F**.
- Available Sleep Window / sleep-progress polish → **6G**.
- Beta infrastructure, deferred live account and Circles testing, physical Chair Sit-to-Stand check → **6H**.
- Final release polish → **6I**.

### iPhone test plan (Phase 6A) ✅ passed 14 Oct 2026
Use the existing development build (`npx expo start`, then open it in the Terbit MY dev build).
1. **Existing install (your phone):** open the app. It must open Today as usual (no onboarding). Alarms, history, XP, streak and Night Routine are unchanged.
2. Settings → Alarms & missions → **Personalise Terbit** → Build my Terbit routine.
3. **About you:** prefilled with your current Faith and Mobility. Pick a gender. Continue.
4. **Goals:** pick Education and Fitness; leave Faith on "Not now". Go Back, change Mobility, and check the Fitness options change.
5. **Modes:** the order is Gentle, Reward, Challenge. On the Free plan, Challenge shows 🔒 and explains Terbit+. Set Education → Gentle, Fitness → Reward.
6. **Times:** Fitness → Morning, Education → Afternoon; open the suggested time (12:30) and change it.
7. **Skip test:** tap Skip on Wake-up → the warning appears → Continue setup. Tap Skip again → no warning (it skips).
8. Go Back to **Wake-up:** weekdays 06:30, weekends Different 08:00, snooze 10 min × 3.
9. **Wind-down:** 22:30 / 23:00. Try a wind-down after bedtime: Continue is blocked with a message. Leave **"Add a Night Routine"** (or "Update my Night Routine" if you have one) **off** for now.
10. **Review:** Mon–Fri and Sat–Sun groups; the Main Wake-Up shows Fitness · Reward and "10 min snooze × 3"; Education every day; "Your sleep targets" with wind-down target, bedtime target, **Night Routine: Not included**, and the Available Sleep Window (Sun–Thu 7h 30m, Fri–Sat 9h). "What will change" has no Night Routine line. "What will change" lists what happens to your current Main Wake-Up(s).
11. **Adjust** → Wake-up and snooze → change weekdays to 06:45 → "Back to my routine" → the review updates.
12. **Interrupt:** force-close the app on the review, reopen, Settings → Personalise Terbit → "Continue where you left off" → same answers.
13. **Use this routine** → confirm. Today shows the new alarms; the Alarms tab shows them as normal alarms; the weekly schedule shows one Main Wake-Up per day. **Alarms → Night Routine is exactly as before** (same times and apps; or still not set up).
13a. **Night Routine opt-in:** Personalise again → on the wind-down step turn on "Update my Night Routine" (or "Add a Night Routine") → the review shows "Night Routine: Uses these times" and a Night Routine line under "What will change" → Use this routine → the Night Routine has the new wind-down and bedtime and keeps your chosen apps.
13b. Personalise once more: the switch starts **off** again, and the wind-down/bedtime are prefilled from your saved targets.
14. Let a Main Wake-Up ring (set it a few minutes ahead via Adjust): snooze works, the mission is Fitness, and XP and the morning streak work as before.
15. **Rerun:** Personalise again with the same answers → Use this routine → no duplicate alarms. Then remove the Education goal → its alarm is removed; your own alarms stay.
16. **Close:** start again, tap Close → warning → Skip personalisation → nothing changed.
17. Circles (signed out) still shows the sign-in message; goals, gender and sleep appear nowhere in Circles.
18. Optional fresh-install check (only on a spare device, or after deleting the app, which erases its data): the first launch opens personalisation once; Close → Today; relaunch → not shown again.


## Beta requirements (must be done before public beta)

- **Accounts & email live verification** (deferred by owner decision, 13 Oct 2026; Phase 2B/5A architecture is built and unit-tested). Until all of these are done, accounts aren't verified end to end:
  1. **Final name and domain** chosen and bought.
  2. **Custom SMTP** (Authentication → Emails → SMTP Settings) with a sender address on that domain.
  3. **Branded auth email templates** (Confirm signup and Magic Link), each showing the 6-digit `{{ .Token }}` code.
  4. **Live OTP email delivery**, including to an address outside the Supabase project team.
  5. **Real iPhone sign-in with production-style email**, then the full account checklist: guest → account (existing alarms, history, XP, achievements appear once in the Table Editor), sync twice and restart (no duplicates), sign out (local data stays), sign back in (no duplicates), airplane mode → reconnect (Offline → Synced), delete account (cloud rows gone, local data kept).
  6. **Two-account live RLS check:** `supabase/tests/rls_check.sql` with two real accounts.
  7. **New-device / cloud restore**, once restore is built (the cloud is backup-only today).
  8. **Circles, live and account-dependent (Phase 5B; deferred by owner decision, 14 Oct 2026).** The rules are already covered by unit tests and `supabase/tests/circles_rls_check.sql`; these are the end-to-end checks with real accounts:
     1. live OTP delivery for both test accounts;
     2. real iPhone sign-in with a real account;
     3. setting a Circles display name through the live app;
     4. creating, renaming and sharing a live Circle (you're the owner; invite code and expiry shown; Share invite; New code; Rename);
     5. joining with an invite code on a second account (preview shows the name only; join; joining again makes no duplicate; wrong code → "That invite code isn't valid");
     6. two accounts on two phones (or one phone, switching accounts);
     7. live member-list privacy: both Circles names and the owner badge, and no email, Faith, time zone or progress;
     8. leave (member) and delete (owner) flows, and the owner can't leave;
     9. the authenticated offline Circles cache (Airplane mode: last list shown, actions say "You're offline");
     10. the Circles cache cleared at sign-out.
  Steps and details: [docs/CLOUD.md](docs/CLOUD.md) → "Beta-stage verification".

- **Faith Content Sources and Review Approval.** Choose trusted sources per tradition (with licences covering display, caching and offline fallback) and qualified reviewers; ship only `approved` content; remove all development fixtures. See [docs/FAITH-CONTENT.md](docs/FAITH-CONTENT.md).

- **Production Reflection Music Catalogue and Licensing Approval.** Every production Reflection / Meditation track needs a confirmed licence permitting Terbit MY’s actual usage (commercial app use, playback, caching/offline as used). Development placeholder tracks are never production-approved. Options A–D and the design: [docs/REFLECTION-MUSIC.md](docs/REFLECTION-MUSIC.md).
