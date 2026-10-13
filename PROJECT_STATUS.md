# Project Status

_Last updated: 13 October 2026_

## Current phase

**Phase 1 (iOS prototype) is closed: complete, physically verified on iPhone (11 October 2026) and merged into `main`.** Android work is deferred to the dedicated Android parity phase (see "Android status" below). See [docs/ROADMAP.md](docs/ROADMAP.md).

**Phase 2A (local Progress Engine) is complete and verified on iPhone. Phase 2B (Accounts & Cloud Foundation) is complete on the repository side (12 Oct 2026): the Supabase project, schema and RLS are live; live sign-in and cloud-sync testing are deferred to the beta stage (see "Deferred to beta" below).**

**Phase 3 (3A Education, 3B Fitness, 3C Faith, 3D Settings & Accessibility, 3.5 Core UX Consolidation) is complete, verified on iPhone and merged into `main` (13 Oct 2026). Phase 4 has not started.**

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
| **Saved alarms scheduled natively** (create/edit → schedule, disable/delete → cancel, weekday repeats) | ✅ Verified on iPhone · Android: built + unit-tested, device test in the parity phase |
| **Genuine alarm → occurrence → configured mission → Recent mornings** | ✅ Verified on iPhone |
| **Accountability modes per alarm:** Reward / Gentle / Challenge, with `evaluateMorning`, `isRewardEligible`, `isStreakEligible` | ✅ Verified on iPhone |
| **One-tap "Stop & Open Terbit" / "Stop & Start Mission"** (iOS AlarmKit App Intents, per-mode icon) | ✅ Verified on iPhone. It opens straight into the configured mission **both when Terbit MY was closed and when it was in the background**. History: the button first didn't appear (fixed with the iOS 26.1 alert API); then it opened Today first (fixed with the native `onAlarmAction` event and the launch route); then it failed from the background (fixed: the Alarms tab `/alarms` was mistaken for the alarm screen, and navigation now waits until the app is active). |
| **Gentle reminders** (iOS local notification, 5/10/15 min) | ✅ Verified on iPhone · Android: in the parity phase |
| **Entitlement layer** (`isFeatureAvailable`, `useEntitlement`, `FeatureGate`; local mock only) | ✅ Verified on iPhone: Free / Trial / Premium states visible, and Challenge follows the provisional rules. See docs/MONETISATION.md |
| Alarm sound catalog (basic/premium) and share-card architecture | ✅ Prepared (no library, no sharing UI) |
| Simulated flow ("Simulate alarm now"), developer "Native alarm test", "Test plan (developer)" | ✅ Developer builds only (`__DEV__`); not shown in release builds |

Final checks (11 Oct): `npm run check` passes (lint, typecheck and 242 unit tests, including real SQLite migrations); `npx expo-doctor` passes 21/21; iOS, Android and web bundles export without errors. Swift and Kotlin are compiled only by EAS Build (there's no local Xcode or Android SDK).

### Android status (deferred by decision, 11 Oct 2026)
- ✅ **Basic native alarm functionality was physically proven on Android** earlier in Phase 1 (milestone 1, on the owner's HONOR phone).
- ⚠️ **Later Android-native changes have not all been recompiled.** The Kotlin code changed in `fc8a5a6` and `59f24b9`, after the last Android build that was installed. Shared TypeScript still typechecks, and the Android JavaScript bundle exports.
- ⏸️ **Deferred on purpose:** Android compatibility, native compilation (EAS Android builds), physical testing and full feature parity. The priority is speed in finishing the iOS prototype, so phases no longer end with an Android build check.
- ➡️ All of this is handled in the **dedicated Android parity phase (A)**, after the iOS prototype is feature-complete. Expect some Kotlin compile fixes there.

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
New features are built and tested on the physical iPhone first. Android stays supported: the Android code already written is kept, and shared logic stays platform-neutral. But new native features aren't duplicated in Kotlin until the behaviour is validated, and there's no Android build per feature or per phase. Android compilation, testing and parity all happen in a dedicated Android parity phase once the iOS prototype is feature-complete (policy updated 11 Oct 2026). See docs/ROADMAP.md.

### Beta product assumptions (provisional, not permanent)
These are the current working assumptions for beta. They're deliberately configurable, so changing them doesn't need a database or screen change.

| Assumption | Current value | Where it's configured |
|---|---|---|
| Alarm modes | **Reward** (default), **Gentle**, **Challenge**, chosen per alarm | `MODE_POLICIES` in `src/features/alarms/accountability.ts` |
| Reward | Free | `ACCESS_POLICY` → `FREEMIUM_POLICY` in `src/features/entitlements/policy.ts` |
| Gentle | Free | same |
| Challenge | Premium (falls back to Reward without access) | same |
| Trial | Full access for the configured trial period (`trialDays`, currently 7) | same; Model B (`TRIAL_POLICY`, trial on first launch) is prepared |
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
| Marked self-reported everywhere (editor, mission, result, history); no camera or pose detection | ✅ |
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
- **Camera-verified Fitness missions** (on-device pose detection). Fitness is self-reported today; the camera is never requested.

## Beta requirements (must be done before public beta)

- **Faith Content Sources and Review Approval.** Choose trusted sources per tradition (with licences covering display, caching and offline fallback) and qualified reviewers; ship only `approved` content; remove all development fixtures. See [docs/FAITH-CONTENT.md](docs/FAITH-CONTENT.md).

- **Production Reflection Music Catalogue and Licensing Approval.** Every production Reflection / Meditation track needs a confirmed licence permitting Terbit MY’s actual usage (commercial app use, playback, caching/offline as used). Development placeholder tracks are never production-approved. Options A–D and the design: [docs/REFLECTION-MUSIC.md](docs/REFLECTION-MUSIC.md).
