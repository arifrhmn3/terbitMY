# Project Status

_Last updated: 7 October 2026_

## Current phase

**Phase 1 milestone reached: shared alarm flow + native alarm proof of concept, verified on a physical iPhone and Android phone.**

The phones can now schedule and ring genuine system alarms: AlarmKit on iOS 26+, `AlarmManager.setAlarmClock` on Android. Your *saved* alarms don't ring natively yet, and a real alarm doesn't open the mission yet. Those are the remaining Phase 1 milestones (see "What's left in Phase 1"). Phase 2 has not started. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
| Alarm data model: time, repeat days, on/off, mission, snooze, main wake-up alarm | ✅ |
| Alarm list + editor screens, saved in SQLite on the device | ✅ Tested by the owner (Expo Go and dev builds) |
| Maths mission: Easy/Medium/Hard, 3/5/10 questions, retry, result, practice screen | ✅ Tested by the owner |
| `AlarmService` interface (shared TypeScript; Swift and Kotlin behind it) | ✅ |
| Alarm occurrences and accountability outcomes (see below), duplicate protection | ✅ Unit-tested, including real SQLite |
| Shared full-screen ringing screen, maths mission connected to occurrences, morning-complete confirmation | ✅ Built · ⏳ simulated flow not yet separately confirmed by the owner |
| "Simulate alarm now" and "Recent mornings" history | ✅ Built (simulation is developer builds only) · ⏳ not yet separately confirmed by the owner |
| **Native alarm proof of concept**: local Expo module `modules/terbit-alarms`. iOS: AlarmKit (iOS 26+), authorisation, one-time alarm, cancel, state. Android: `setAlarmClock`, permissions, receiver, alarm notification + basic lock-screen alarm screen. | ✅ **Physically verified on iPhone and Android:** scheduled, rang, stopped with the system controls |
| Developer "Native alarm test" panel | ✅ Developer builds only |

Checks: `npm run check` passes (137 unit tests, including real SQLite queries), `npx expo-doctor` 21/21, and iOS, Android and web bundles export without errors.

### Accountability model (agreed product behaviour)

The phone's own alarm controls can always stop an alarm. **Terbit MY doesn't try to disable or bypass them.** Instead, every alarm occurrence ends in an outcome, and **only a completed mission counts as a successful morning** for future streaks and XP:

| Outcome | Meaning | Successful morning? |
|---|---|---|
| Mission completed | The mission was finished | ✅ Yes |
| Dismissed, no mission | Stopped (Emergency Dismiss in the app, or the phone's Stop) before the mission started | ❌ |
| Mission abandoned | The mission was started but never finished (dismissed, or left until the alarm timed out) | ❌ |
| Missed | Nobody responded within an hour | ❌ |
| Turned off (no mission) | The alarm had no mission set | ❌ |
| Cancelled | The alarm was deleted | Doesn't count |

Statuses stored per occurrence: `scheduled`, `alarm_fired`, `mission_in_progress`, `completed`, `dismissed`, `missed`, `cancelled`. Code: `morningOutcome()` / `isSuccessfulMorning()` in `src/features/alarms/occurrence.ts`.

### What's left in Phase 1
1. **Saved alarms ring natively.** Schedule the user's real (repeating) alarms through AlarmKit / AlarmManager instead of only the developer test alarm.
2. **Alarm → mission hand-off.** When a native alarm fires and the app opens, create the occurrence and open the ringing screen and mission. Record a stop with the phone's controls as "dismissed".
3. **Android reliability:** reschedule after a restart and after time-zone changes, and a foreground-service alarm sound.
4. **Snooze** on both platforms.
5. **iOS before 26:** decide on a notification fallback (it can't ring in silent mode) or require iOS 26.

### Known limitations (today)
- The system Stop control on both platforms ends the alarm without a mission. This is by design, recorded as an outcome (above).
- Only the developer test alarm rings natively. Saved alarms show "Alarms can't ring yet".
- AlarmKit needs iOS 26+. Older iPhones get a clear "unsupported" message.
- Android test alarms don't survive a phone restart yet. The alarm sound is an alarm-category notification, not yet a foreground service.
- Stops made with the system controls aren't reported back to the app yet.
