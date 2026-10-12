# Project Status

_Last updated: 11 October 2026_

## Current phase

**Phase 1 (iOS prototype) is closed: complete, physically verified on iPhone (11 October 2026) and merged into `main`.** Android work is deferred to the dedicated Android parity phase (see "Android status" below). See [docs/ROADMAP.md](docs/ROADMAP.md).

**Phase 2A (local Progress Engine) is complete and verified on iPhone. Phase 2B (Accounts & Cloud Foundation) is complete on the repository side (12 Oct 2026): the Supabase project, schema and RLS are live; live sign-in and cloud-sync testing are deferred to the beta stage (see "Deferred to beta" below).**

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
| **Morning vs general accountability** (from the test): only the Main Wake-Up Alarm counts as a morning; other alarms earn XP and count in "All alarms". Each occurrence stores `isMainWakeUp` when it fires (migration 7) | ✅ Unit-tested · ⏳ iPhone retest |

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

The phone's own alarm controls can always stop an alarm, and **Terbit MY never tries to disable or bypass them.** Stopping the alarm is recorded, but the morning stays open: the mission can still be completed until the deadline (one hour after the alarm, or one hour after the Gentle follow-up).

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
| Gentle follow-up | 5/10/15 minutes; completion deadline one hour after the alarm (Gentle: one hour after the follow-up) | alarm settings + `accountability.ts` |
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
