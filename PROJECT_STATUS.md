# Project Status

_Last updated: 11 October 2026_

## Current phase

**Phase 1 (iOS prototype) is complete and physically verified on iPhone (11 October 2026).** Branch `phase-1/dev-build-setup`, waiting for review and merge. One item stays open under the iOS-first strategy: the end-of-phase Android EAS compile check (see "Android compatibility check" below). Phase 2 has not started. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

### Android compatibility check (iOS-first policy)
- ✅ Shared TypeScript compiles, and the Android JavaScript bundle exports.
- ⏳ **The Kotlin code has not been compiled since `59f24b9`.** The last Android build installed on the HONOR phone predates it. Confirming it compiles needs one Android EAS development build: `npx eas-cli@latest build --profile development --platform android`. A quick smoke test of saved alarms on that build is optional; full Android behaviour is tested in the parity phase.

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
