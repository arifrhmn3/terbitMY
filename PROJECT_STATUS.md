# Project Status

_Last updated: 7 October 2026_

## Current phase

**Phase 1: saved alarms, accountability modes and the native alarm → mission hand-off are built; waiting for physical-device testing.** The native alarm proof of concept is already verified on a physical iPhone and Android phone. Phase 2 has not started. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

## Phase 1: Alarms MVP (device-local)

| Item | Status |
|---|---|
| Development builds (`expo-dev-client`, `eas.json`); signed iOS build and Android APK installed on the owner's phones | ✅ Verified on device |
| Alarm data model: time, repeat days, on/off, mission, snooze preference, main wake-up alarm, **accountability mode** | ✅ |
| Alarm list + editor screens, saved in SQLite on the device | ✅ Tested by the owner (mode selector: ⏳ new build) |
| Maths mission: Easy/Medium/Hard, 3/5/10 questions, retry, result, practice screen | ✅ Tested by the owner |
| `AlarmService` interface (shared TypeScript; Swift and Kotlin behind it) | ✅ |
| Alarm occurrences, duplicate protection | ✅ Unit-tested, including real SQLite |
| Native alarm proof of concept (one-time test alarm) | ✅ **Physically verified on iPhone and Android** |
| **Saved alarms scheduled natively** (create/edit → schedule, disable/delete → cancel, weekday repeats; Android reschedules after restart / time change) | ✅ Built + unit-tested · ⏳ needs new builds + device test |
| **Genuine alarm → occurrence → configured mission → Recent mornings** | ✅ Built + unit-tested · ⏳ needs new builds + device test |
| **Accountability modes:** Reward / Challenge / Gentle, with `evaluateMorning`, `isRewardEligible`, `isStreakEligible` | ✅ Built + unit-tested · ⏳ device test |
| Simulated flow ("Simulate alarm now"), developer "Native alarm test" | ✅ Developer builds only |

Checks: `npm run check` passes (192 unit tests, including real SQLite queries), `npx expo-doctor` 21/21, and iOS, Android and web bundles export without errors. Swift and Kotlin are compiled by EAS Build (there's no local Xcode or Android SDK).

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
New features are built and tested on the physical iPhone first. Android stays supported: the Android code already written is kept, and shared logic stays platform-neutral. But new native features aren't duplicated in Kotlin until the behaviour is validated, and there's no Android build per feature. Android gets a compatibility/build check at the end of each phase, and a dedicated feature-parity phase after the iOS prototype. See docs/ROADMAP.md.

### Before Phase 1 can close
1. Rebuild **iOS** and pass the iPhone tests for saved alarms and all three modes.
2. Decide on the remaining items below: fix now on iOS, or move to a later phase.
3. **Android compatibility check (end of phase):** one Android development build to confirm the project still compiles, plus a quick smoke test of saved alarms. The Android alarm code for this phase is already written and unit-tested in shared code; its full device test belongs to the Android parity phase.

### Known limitations (today)
- The system Stop control ends the alarm without the mission. This is by design and recorded.
- **iOS:**
  - AlarmKit doesn't report fires or stops to apps. Fires are worked out from the schedule when Terbit MY opens, and the user must open Terbit MY for the mission. Stops aren't known.
  - There's no native alarm before iOS 26.
- **Android:** the alarm sound is a notification sound, not yet a foreground service, and alarms aren't restored before the first unlock after a restart.
- **Snooze:** not implemented.
- **Gentle:** the follow-up reminder isn't delivered as a notification yet.
