# Project Status

_Last updated: 6 October 2026_

## Current phase

**Phase 0 (Foundation) is complete.** The next milestone is moving from Expo Go to an Expo development build, the first step of Phase 1. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

## Phase 1 progress: work that doesn't need Apple (in progress)

Built while the Apple Developer team is waiting for approval. **No alarm can ring yet.** Native triggering isn't implemented, and the app says so on the Alarms screen.

| Item | Status |
|---|---|
| Dev-build config checked (iOS + Android); Android APK steps added to DEV-BUILD.md | ✅ |
| Alarm data model: time, repeat days, on/off, mission, snooze, main wake-up alarm | ✅ |
| Alarm list + editor screens | ✅ Tested by the owner on iPhone via Expo Go (editor, saving, on/off, maths practice) |
| Local saving in SQLite (`expo-sqlite`, in Expo Go) | ✅ |
| `AlarmService` interface with a "not implemented" version | ✅ |
| Maths mission: Easy/Medium/Hard, 3/5/10 questions, retry, result, practice screen | ✅ |
| Alarm occurrences: status tracking, duplicate protection, missed/cancelled handling | ✅ |
| Shared full-screen ringing screen (clock, label, mission, Start Mission, snooze placeholder, Emergency Dismiss) | ✅ ⏳ awaiting owner test on iPhone |
| Maths mission connected to occurrences; morning-complete confirmation | ✅ ⏳ awaiting owner test on iPhone |
| "Simulate alarm now" (developer builds only, clearly labelled as a simulation) | ✅ ⏳ awaiting owner test on iPhone |
| "Recent mornings" history | ✅ ⏳ awaiting owner test on iPhone |
| iOS / Android `AlarmService` placeholders + docs/NATIVE-ALARMS.md | ✅ (placeholders only) |
| iOS and Android development builds installed and running on the owner's phones | ✅ |
| Native alarm milestone 1: one-time AlarmKit (iOS 26+) / AlarmManager alarms + developer "Native alarm test" | ✅ Code written · ⏳ needs new dev builds + physical-device test |
| Saved repeating alarms ringing natively, alarm → mission hand-off, snooze, reboot rescheduling | ⏳ Not started |

Checks: `npm run check` passes (130 unit tests, including real SQLite queries), `npx expo-doctor` 21/21, and iOS, Android and web bundles export without errors. The Swift and Kotlin code is first compiled by EAS Build; there's no local Xcode or Android SDK.

## Next milestone: Expo development build

**Project setup done** on branch `phase-1/dev-build-setup`: `expo-dev-client` installed, `eas.json` added, and `npm run start:go` added to keep using Expo Go. No development build has been made yet. No native alarm code (AlarmKit, notification fallback or Android alarms) has been written.

Before work starts, the owner needs:
- [ ] A free Expo account (https://expo.dev/signup)
- [ ] An Apple Developer Program membership (US$99/year). This is required to install any build on a real iPhone.
- [ ] The iPhone's iOS version noted (AlarmKit needs iOS 26 or later)
- [ ] A decision on whether this Phase 0 branch becomes `main` first

Step-by-step guide: [docs/DEV-BUILD.md](docs/DEV-BUILD.md).
