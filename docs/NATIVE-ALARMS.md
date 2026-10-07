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
| **Reward** (default; existing alarms migrated here) | Start mission, or Skip (no reward) | Mission completed, then or later that morning | — |
| **Challenge** | Opens straight into the mission; "Give up" is recorded as an incomplete Challenge morning | Mission completed | System alarm title says "open Terbit MY for your mission" |
| **Gentle** | Start mission, or Later | Mission completed, including after the follow-up | Follow-up due `gentleReminderMinutes` after the alarm stops, shown in the app. Reminder notifications aren't sent yet. |

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
  - AlarmKit doesn't tell apps when an alarm fires or is stopped. Fires are worked out from the schedule when Terbit MY opens, and a stop isn't known. A morning nobody acts on in the app closes as "Missed (no response recorded)".
  - The iOS alarm can't open the mission directly. The user opens Terbit MY, which then routes to the mission. This could be improved later with an AlarmKit App Intent button.
- **iOS before 26:** no native alarms. The app says so.
- **Android:**
  - The alarm sound is a repeating alarm-category notification, not yet a foreground service.
  - Saved alarms are put back after a restart (`RescheduleReceiver`), but not before the first unlock after a restart.
- **Snooze:** not available on either platform yet.
- **Gentle:** the follow-up is shown in the app only. No notification is sent yet.

## Android notes

- Permissions: `USE_EXACT_ALARM` (13+), `SCHEDULE_EXACT_ALARM` up to 12L, `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `VIBRATE` and `RECEIVE_BOOT_COMPLETED`. They're declared in the module's own manifest, so `app.json` doesn't change.
- Google Play will need declarations for exact alarms and full-screen intents before release.

## iOS notes

- AlarmKit needs iOS 26+, the `NSAlarmKitUsageDescription` text, and a signed build. AlarmKit is weak-linked, so the app still launches on older iOS.
- An alarm that only alerts (no countdown) needs no widget extension.
