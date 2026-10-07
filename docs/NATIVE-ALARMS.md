# Native Alarms

Saved Terbit MY alarms are scheduled as genuine system alarms: AlarmKit on iOS 26+, `AlarmManager.setAlarmClock` on Android. When one goes off, Terbit MY records the morning and routes the user to the configured mission, as far as each platform allows.

> **Status:**
> - **Milestone 1** (one-time native test alarm): physically verified on an iPhone and an Android phone.
> - **Saved alarms + hand-off + accountability modes**: built and unit-tested. ⏳ Needs new development builds and a physical-device test.

## Platform limitation: the system Stop control can't be prevented

On both iOS (AlarmKit) and Android, the operating system always gives the user a way to stop a ringing alarm: the system alarm UI, the notification, or the lock screen. **Terbit MY must not try to disable, hide or bypass these controls.** This was confirmed on real devices in milestone 1.

So stopping the *alarm* and finishing the *morning* are recorded separately:
- A stop with the phone's controls is recorded (`alarmStopReason: 'system'`). The mission can still be completed afterwards, until the completion deadline.
- If the mission never happens, the morning closes as dismissed (`system_dismiss`). Giving up inside Terbit MY is `emergency_dismiss`. A mission that was started but not finished is abandoned.
- Whether a morning earns rewards or a streak is decided by `evaluateMorning()` / `isRewardEligible()` / `isStreakEligible()` in `src/features/alarms/accountability.ts`, using the alarm's accountability mode.

## Accountability modes (beta)

Each alarm has a `completionMode`, copied onto every occurrence. The rules live in `MODE_POLICIES`, so beta behaviour can change without a database change.

| Mode | Alarm screen | Counts for reward / streak | Extra |
|---|---|---|---|
| **Reward** *(free/core; existing alarms migrated here)* | One-tap **Stop & Open Terbit** → straight into the mission; or Skip (no reward) | Mission completed, then or later that morning | — |
| **Challenge** *(premium-capable)* | One-tap **Stop & Start Mission** → straight into the mission; "Give up" = incomplete Challenge morning | Mission completed | Needs the `challenge_mode` entitlement; otherwise the alarm behaves as Reward (it still rings) |
| **Gentle** *(free/core)* | One-tap **Stop & Open Terbit** → the mission; or Later | Mission completed, including after the follow-up | Local reminder notification `gentleReminderMinutes` (5/10/15) after the alarm stops (iOS; Android in the parity phase) |

The mode belongs to **each alarm**, so different alarms can use different modes. Availability comes from the entitlement layer (see [MONETISATION.md](MONETISATION.md)).

### One-tap action ("Stop & Open Terbit")
- **iOS:** the AlarmKit alert has the system **Stop** button plus a secondary button with the mode's label. Its App Intent (`TerbitOpenMissionIntent`, `supportedModes: .foreground(.immediate)`) stops that alert, records `{alarmId, nativeId, action: 'mission', at}`, and asks iOS to open Terbit MY.
  - On launch, the hand-off reads the record, creates the morning (with 'system' evidence) and goes straight into the mission.
  - The Stop button's intent (`TerbitStopIntent`, background) records a system stop.
  - AlarmKit has no route-into-a-screen API, so this record-then-reconcile hand-off is the supported pattern. iOS may also show other system dismiss controls that don't run Terbit MY's intents.
- **Android:** the native alarm screen's primary button is **Stop & Open Terbit** (**Stop & Start Mission** in Challenge mode). It stops the sound and opens `terbitmy://alarm-fired?…&start=1`. **Stop alarm** stays available.

The completion deadline is one hour after the alarm was due. For Gentle it's one hour after the follow-up.

## How a genuine alarm flows

```
Alarm editor → alarmStore.save → AlarmService.schedule(spec)      (enabled)
                               → AlarmService.cancel(id)          (disabled / deleted)
        │  iOS: one AlarmKit alarm (.relative weekly, or .fixed once)
        │  Android: setAlarmClock for the next ring; receiver schedules the next weekly ring
        ▼
System alarm rings (the phone's Stop control always works)
        │  Android: native screen with "Start mission" (→ terbitmy://alarm-fired?…&start=1) and "Stop alarm"
        ▼
App opens / returns to foreground → handOff.sync()                  src/features/alarms/alarm-handoff.ts
        1. AlarmService.getFireEvents(last 24 h)
             Android: the receiver recorded each fire + how it was stopped ('system' evidence)
             iOS: due times worked out from the AlarmKit schedule ('schedule' evidence; iOS doesn't tell apps when an alarm fires)
        2. occurrences.recordNativeFire(alarm, event)                 safe to repeat; one occurrence per (alarmId, scheduledAt)
        3. one-off alarms that rang are turned off
        4. AlarmService.syncAll(enabled alarms)                       reconcile the native schedule
        5. newest open native morning → /alarm/[occurrenceId]          mission per mode → Recent mornings
```

## Where the code lives

| File | Contents |
|---|---|
| `modules/terbit-alarms/ios/` | Swift: `TerbitAlarmsModule.swift` (JS API), `AlarmKitBridge.swift` (the only AlarmKit code), `NativeAlarmRecords.swift` |
| `modules/terbit-alarms/android/` | Kotlin: `TerbitAlarmsModule.kt`, `SavedAlarms.kt` (saved-alarm definitions, next-ring maths, reschedule), `AlarmScheduler.kt`, `AlarmReceiver.kt`, `RescheduleReceiver.kt` (restart / time change), `AlarmNotifications.kt`, `AlarmAlertActivity.kt`, `NativeAlarmRecords.kt`, `AndroidManifest.xml` |
| `modules/terbit-alarms/src/` | TypeScript types. `requireOptionalNativeModule` makes it null in Expo Go and on web. |
| `src/services/alarm-scheduler/native-alarm-service.ts`, `native-records.ts` | Shared mapping of the module onto `AlarmService`, fire-event and reconcile logic |
| `src/features/alarms/accountability.ts` | Modes, outcomes, eligibility |
| `src/features/alarms/alarm-handoff.ts`, `use-alarm-handoff.ts`, `src/app/alarm-fired.tsx` | Fired alarm → occurrence → mission screen |
| `app.json` → `ios.infoPlist.NSAlarmKitUsageDescription` | Required by AlarmKit |

## Known limitations

- **iOS:**
  - AlarmKit doesn't report fires to apps. Without a button tap, fires are worked out from the schedule when Terbit MY opens. Taps on Stop / Stop & Open Terbit are recorded by App Intents and confirm the fire.
  - Some system dismiss paths may not run the intents. Those mornings close as "Missed (no response recorded)".
  - Running App Intents from inside our Expo module follows a pattern used by another published Expo AlarmKit module, but is unverified until tested on the iPhone.
- **iOS before 26:** no native alarms. The app says so.
- **Android:**
  - The alarm sound is a repeating alarm-category notification, not yet a foreground service.
  - Saved alarms are put back after a restart (`RescheduleReceiver`), but not before the first unlock after a restart.
- **Snooze:** not available on either platform yet.
- **Gentle:** the follow-up is a local notification on iOS. It's scheduled when Terbit MY learns the alarm stopped (normally when the app opens via Stop & Open Terbit or afterwards), not by the system Stop alone. Android shows it in the app only, until the parity phase.

## Android notes

- Permissions: `USE_EXACT_ALARM` (13+), `SCHEDULE_EXACT_ALARM` up to 12L, `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `VIBRATE` and `RECEIVE_BOOT_COMPLETED`. They're declared in the module's own manifest, so `app.json` doesn't change.
- Google Play will need declarations for exact alarms and full-screen intents before release.

## iOS notes

- AlarmKit needs iOS 26+, the `NSAlarmKitUsageDescription` text, and a signed build. AlarmKit is weak-linked, so the app still launches on older iOS.
- An alarm that only alerts (no countdown) needs no widget extension.
