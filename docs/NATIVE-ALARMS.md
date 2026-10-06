# Native Alarms: What's Left to Build

The shared alarm flow is finished: settings, saving, the ringing screen, the maths mission, history, and the rules that stop an alarm being completed twice. **The only missing piece is making the phone actually ring.** That part is platform code behind `AlarmService`.

> Status: **Milestone 1 (proof of concept) is written but not yet verified on a device.** The local module `modules/terbit-alarms` can schedule, cancel and list **one-time** native alarms:
> - iOS: AlarmKit, iOS 26+. Authorisation, one-time `.fixed` alarms, cancel, state. Terbit MY IDs travel in `AlarmMetadata`.
> - Android: `AlarmManager.setAlarmClock`. Exact-alarm and notification checks, a receiver that works with the app closed, an alarm notification with repeating alarm sound, and a basic native alarm screen over the lock screen.
>
> It's used only by the developer **Native alarm test** on the Alarms tab. The user's saved (repeating) alarms still report `not-implemented`, and nothing opens the mission from a real alarm yet. "Simulate alarm now" is still the way to test the ringing screen and mission.
>
> **Milestone 1 behaviour to know:**
> - iOS: the system shows its own alarm UI with a Stop control. Terbit MY can't force the mission before the alarm stops.
> - Android: the sound is a repeating alarm-category notification sound, not yet a foreground service. Alarms don't survive a phone restart yet.

## How a real alarm will flow

```
AlarmService.schedule(spec)     ← called by the alarm store when an alarm is saved or turned on
        │  (native: AlarmKit / AlarmManager)
        ▼
System alarm rings → user taps it → app opens
        │
        ▼
AlarmService.getLaunchEvent()   (app was closed)
AlarmService.addFiredListener() (app was open)
        │  { alarmId, scheduledAt }
        ▼
useNativeAlarmLaunch()          src/features/alarms/use-native-alarm-launch.ts  ✅ built
        │  occurrences.trigger(alarm, { scheduledAt, source: 'native' })
        ▼
/alarm/[occurrenceId]           the shared ringing screen  ✅ built
```

`scheduledAt` must be the time the alarm was **due**, not when it was tapped. The pair `(alarmId, scheduledAt)` identifies one alarm event. If the same event is delivered twice, the second delivery is ignored.

## Where the code lives

| File | Contents |
|---|---|
| `modules/terbit-alarms/ios/` | Swift: `TerbitAlarmsModule.swift` (JS API), `AlarmKitBridge.swift` (the only AlarmKit code), `NativeAlarmRecords.swift` |
| `modules/terbit-alarms/android/` | Kotlin: `TerbitAlarmsModule.kt`, `AlarmScheduler.kt`, `AlarmReceiver.kt`, `AlarmNotifications.kt`, `AlarmAlertActivity.kt`, `NativeAlarmRecords.kt`, plus `AndroidManifest.xml` (permissions, receiver, activity) |
| `modules/terbit-alarms/src/` | TypeScript types for the module. `requireOptionalNativeModule` makes it null in Expo Go and on web. |
| `src/services/alarm-scheduler/native-alarm-service.ts` | Maps the module onto the shared `AlarmService` (same TypeScript for both platforms) |
| `src/services/alarm-scheduler/ios-alarmkit.ts`, `android-alarm-manager.ts` | Use the native module when present, otherwise not-implemented |
| `app.json` → `ios.infoPlist.NSAlarmKitUsageDescription` | Required by AlarmKit |

The screens, the store and the occurrence logic shouldn't need changes.

## The contract each platform must meet

- `getCapabilities()` returns `status: 'ready'` only when alarms will really ring, so the "Alarms can't ring yet" notice disappears.
- `requestPermission()` asks only when the user saves their first alarm, not at app start.
- `schedule(spec)` schedules the next ring and every weekly repeat in `spec.weekdays` (0 = Sunday). An empty list means ring once. Calling it again for the same `spec.id` replaces the old schedule.
- `cancel(alarmId)` removes every pending ring for that alarm.
- When the alarm rings and the user opens it, report `{ alarmId, scheduledAt }` through `getLaunchEvent()` (cold start) or `addFiredListener()` (app already running).
- Snooze: the ringing screen has a placeholder. Real snooze needs native rescheduling, so it's added together with the native modules.

## Android notes (no Apple account needed; needs a physical Android phone)

To check against the current Android docs when implementing:
- `AlarmManager.setAlarmClock()` shows the alarm in the system UI and is allowed in Doze.
- Permissions to review: `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` (Android 12+), `POST_NOTIFICATIONS` (13+), `USE_FULL_SCREEN_INTENT` (14+, Play Console declaration), `RECEIVE_BOOT_COMPLETED` (re-schedule after a restart).
- The full-screen notification opens the app on the alarm screen.
- Add all of this through a config plugin in `app.json`. Never edit `android/` by hand.
- **Nothing here is built or tested yet.** Don't call Android alarms working until they've rung on a real phone: locked, on silent, and after a restart.

## iOS notes (blocked until the Apple Developer team is active)

- AlarmKit needs iOS 26+, the `NSAlarmKitUsageDescription` text, and a signed development build.
- Before iOS 26, fall back to time-sensitive notifications. These don't ring in silent mode, and the app must say so.
