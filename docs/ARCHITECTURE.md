# Architecture

## Principles
1. **The device is the source of truth for anything time-critical.** Alarms, the current mission and today's XP are written to a local database first. Supabase is used for sync, backup and circles.
2. **Native features sit behind TypeScript interfaces.** Screens never call Swift or Kotlin directly. They call a TypeScript service, such as `alarms.schedule(...)`, which picks the iOS or Android implementation.
3. **Code is grouped by feature.** Each product area keeps its logic, state and UI together, so it can be built and tested on its own.
4. **No secrets in the app.** The app only holds the Supabase *anon* key. Row Level Security protects all data, and privileged logic runs in Supabase Edge Functions.
5. **iOS-first, Android-ready.** During the prototype, native features are built for iOS first. Shared code must not assume iOS: screens call services, and platform choices live only in `src/services/*` (`index.ts` picks the platform implementation) and `modules/*`. Android gets its own implementation later, behind the same interface. This applies to alarms, notifications, restrictions, sharing, subscriptions, camera and permissions.

## Layers

```
┌───────────────────────────────────────────────────────────┐
│ src/app/           Screens & navigation (Expo Router)     │
├───────────────────────────────────────────────────────────┤
│ src/features/*     Feature logic + feature UI             │
│   alarms · missions · progress · circles · bedtime ·      │
│   restrictions · settings                                 │
├───────────────────────────────────────────────────────────┤
│ src/services/*     Shared TypeScript APIs                 │
│   alarm-scheduler · app-restrictions · storage · sync ·   │
│   notifications · auth                                    │
├──────────────────────────────┬────────────────────────────┤
│ modules/* (Expo Modules API) │ Supabase (Postgres + RLS,  │
│  Swift: AlarmKit, Screen Time│  Auth, Edge Functions)     │
│  Kotlin: AlarmManager, Usage │                            │
└──────────────────────────────┴────────────────────────────┘
```

## Folder layout (target)

```
src/
  app/                    # Routes only. Each file is a screen.
    (tabs)/today|alarms|circles|progress|settings/
    alarm/ring.tsx        # Full-screen alarm + mission flow (Phase 1)
  components/             # Shared UI building blocks
  constants/              # Theme tokens
  features/<name>/        # Logic, hooks and components for one feature
  services/<name>/        # index.ts (TypeScript API) + platform implementations
  lib/                    # Small pure helpers (fully unit-tested)
modules/
  terbit-alarms/          # ios/*.swift, android/*.kt, index.ts
  terbit-restrictions/
supabase/
  migrations/             # SQL schema + RLS policies
  functions/              # Edge Functions (e.g. circle invites)
docs/
```

## Key technology choices

| Concern | Choice | Why |
|---|---|---|
| Navigation | Expo Router with native tabs and native stacks | Real UITabBarController / UINavigationController on iOS, giving Apple-standard behaviour |
| Local database | `expo-sqlite` | Free, offline, built into Expo |
| App state | React state plus small stores (Zustand, if needed) | Simple for a beginner to follow |
| Server state and sync | Supabase JS client with an outbox queue in SQLite | Writes still succeed offline and are replayed later |
| Auth | Supabase Auth: Sign in with Apple, Google, email | Free tier; Apple sign-in is required when other social logins are offered |
| Camera pose detection | Apple Vision body pose (iOS, local `terbit-pose` module); Android later (e.g. ML Kit) through the same joint format | Free; video never leaves the phone |
| Alarm native code | Local Expo module: AlarmKit (iOS 26+), notifications fallback, `AlarmManager.setAlarmClock` (Android) | See FEASIBILITY.md |
| Restrictions native code | Local Expo module + app extensions (iOS); UsageStats + overlay (Android) | See FEASIBILITY.md |
| Builds | EAS Build (development, preview and production profiles) | Builds iOS from Windows |
| Quality | ESLint, TypeScript strict, Jest, GitHub Actions CI | Catches mistakes before they reach a phone |

## Example: a shared native interface

```ts
// src/services/alarm-scheduler/types.ts (Phase 1)
export interface AlarmService {
  getCapabilities(): Promise<AlarmCapabilities>; // 'not-implemented' | 'needs-permission' | 'ready'
  requestPermission(): Promise<'granted' | 'denied' | 'not-implemented'>;
  schedule(alarm: AlarmSpec): Promise<ScheduleResult>; // a saved alarm, repeats included
  cancel(alarmId: string): Promise<void>;
  syncAll(alarms: AlarmSpec[]): Promise<void>; // make the native schedule match
  getFireEvents(since: number, now: number): Promise<AlarmFiredEvent[]>; // genuine alarms that went off
  // …plus developer-test helpers (scheduleOneTime, listNativeAlarms, …)
}
```

`ios-alarmkit.ts` and `android-alarm-manager.ts` both use the shared `native-alarm-service.ts` over the local module `modules/terbit-alarms` (Swift / Kotlin). Where the module is missing (Expo Go, web, tests) they fall back to `not-implemented.ts`, which never claims an alarm was scheduled or fired. The full contract is in [NATIVE-ALARMS.md](NATIVE-ALARMS.md).

## Alarm data flow (Phase 1)

```
Alarm screens ──► alarmStore (src/features/alarms/alarm-store.ts)
                    ├─► AlarmRepository ─► SQLite `alarms` table (iOS/Android)
                    │                     └► in-memory (web preview, tests)
                    └─► AlarmService.schedule / cancel (src/services/alarm-scheduler)
```

Settings are always saved to the device first, then passed to `AlarmService`. The schema lives in `src/services/storage/migrations.ts`, which uses SQLite's `PRAGMA user_version` to track versions.

## Alarm occurrences (Phase 1)

Each time an alarm rings (or is simulated) creates an **occurrence**, stored separately from the alarm's settings in the `alarm_occurrences` table:

```
scheduled ─► alarm_fired ─► mission_in_progress ─► completed
                 └─(no mission)──────────────────► completed
any active status ─► dismissed | missed | cancelled
```

**Accountability** (`src/features/alarms/accountability.ts`). The phone's own Stop control can always end an alarm, and Terbit MY never tries to block it. Stopping the *alarm* (`alarmStoppedAt` / `alarmStopReason`) is separate from finishing the *morning*: the mission can still be completed until the completion deadline. Four ideas are kept apart:
- **alarm outcome:** ringing / went off / stopped by the phone / stopped for the mission / dismissed in the app / unanswered / cancelled;
- **mission outcome:** not required / not started / in progress / completed / skipped / abandoned;
- **accountability mode:** the alarm's `completionMode` (Reward, Challenge or Gentle), copied onto each occurrence;
- **eligibility:** `isRewardEligible()` and `isStreakEligible()`, derived by `evaluateMorning()` from `MODE_POLICIES`.

Beta behaviour changes by editing `MODE_POLICIES` (or passing a different policy), with no database change. Phase 2 XP and streaks must use these functions, not raw statuses.

**Entitlements** (`src/features/entitlements`, `src/services/entitlements`). Feature screens ask `isFeatureAvailable` / `useEntitlement().has(feature)` / `<FeatureGate>`, never "is premium". Which features are free, trial or premium is provisional policy in `policy.ts`. Each alarm's needs are derived from its settings (`alarm-features.ts`), and a locked mode falls back to Reward so alarms always ring. No billing yet; see [MONETISATION.md](MONETISATION.md).

**Native hand-off** (`alarm-handoff.ts`, `use-alarm-handoff.ts`). When the app opens or returns to the foreground: native fire events become occurrences (safe to repeat), fired one-off alarms are turned off, the native schedule is reconciled, and the newest open native morning opens the alarm screen. Android's "Start mission" opens `terbitmy://alarm-fired?…` straight into the mission.

- `src/features/alarms/occurrence.ts`: pure state rules. Finished occurrences can never change.
- `src/features/alarms/occurrence-manager.ts`: trigger, start mission, complete, dismiss, mark missed (past its completion window), cancel (alarm deleted). Opening a morning closes it first if its window has passed; starting or finishing a mission after the window is refused.
- `src/features/alarms/completion-policy.ts`: THE completion windows (`missionCompletionDeadline`, `shouldExpire`, `missionResumeState`, `canResumeMission`):
  - Reward: 2 hours;
  - Challenge: 1 hour;
  - Gentle: the end of the alarm's local day.
- Duplicate protection on two levels. The database has `UNIQUE (alarm_id, scheduled_at)`, plus a partial unique index allowing only one active occurrence per alarm. Every status change is a compare-and-set (`UPDATE … WHERE status = <expected>`), so an occurrence completes at most once. Future XP must be awarded per occurrence ID, which makes double rewards impossible.
- `/alarm/[occurrenceId]` is the shared full-screen ringing screen. "Recent mornings" (`/alarms/history`) lists the latest 30 occurrences.

## Missions (Phase 1 maths, 3A quizzes, 3B fitness, 3C faith)

`src/features/missions/` holds each mission's pure session logic and its screen. An alarm stores its mission as JSON (`AlarmMission`: `none`, `math`, or `quiz` with `category`, `difficulty` and `questionCount`), so new mission types need no schema change. A finished mission produces one `MissionResult` (Maths result, or a quiz result with `type: 'quiz'`). It goes through the same `completeMission` → accountability → progression path, so XP, the Challenge bonus, Main Wake-Up rules and backup all work unchanged.

- **Quiz content:** curated packs bundled with the app (`quiz/packs/*.ts`), always offline, never generated at runtime. The engine asks a `QuestionSource` for a topic and difficulty, so downloaded, topic or age-adapted packs can be added later as another source. Question IDs are permanent (`gk-e-002`); history refers to them.
- **Selection:** a seeded shuffle, preferring questions not in the "recently asked" list (300 IDs, stored in `app_settings`). When a pool runs short, the questions asked longest ago come back first.
- **Flow:** one question at a time. Choose, see right or wrong with a short explanation, then go to the next. The quiz completes after the last question whatever the score; the score is shown and kept for review.
- **XP:** in `PROGRESSION_POLICY`. Every quiz topic counts as Education; base XP per mission type, plus `difficultyBonusXp`, plus the existing `modeBonusXp`.
- **Fitness (Phase 3B, catalogues in 3D):** `{ type: 'fitness', exercise, difficulty }` (`adaptation` only on alarms saved before 3D). It uses four reusable building blocks in `fitness/session.ts`: reps, timed (with optional guided cues), holds, and number sequence. They are pure functions of timestamps, so backgrounding or a slow screen can't distort time.
  - Reps need one deliberate tap each; taps faster than `minRepIntervalMs` are ignored.
  - Timers run from the end of a “get ready” countdown (3 s; 10 s with Extended pacing) and can be paused.
  - Results are marked `self_reported`, `task_checked` (number focus) or `camera_verified` (Phase 4.5: every rep counted by the camera).
  - Targets and anti-tap limits live in `fitness/exercises.ts`.
  - XP counts toward Fitness.
  - Accessibility (Phase 3D): a user-level **Mobility Profile** (Standard / Reduced mobility / Non-physical) and `missionPacing` in `features/accessibility`. Each profile has its own catalogue (`FITNESS_CATALOGUES` in `exercises.ts`); screens show only the current catalogue. An alarm saved under another profile runs the activity in the same place in the current catalogue (`activityForProfile`, internal only; `missionForProfile`, `fitnessConfigFor`, `ProfileFitnessMission`). Non-physical activities are never called exercise; number focus is `task_checked`. XP never depends on the profile.
- **Camera rep counting (Phase 4.5, verified on iPhone 13 Oct 2026):**
  - **Native:** `modules/terbit-pose` (iOS). An `ExpoView` runs an `AVCaptureSession` (front camera, 640×480, portrait frames) with an `AVCaptureVideoDataOutput`. About 15 frames a second go to Apple Vision's `VNDetectHumanBodyPoseRequest`, in memory only. Only 12 joints (shoulders, elbows, wrists, hips, knees, ankles: x, y, confidence) are sent to JavaScript. There is no movie or photo output, and nothing is written or sent anywhere. The camera runs only while the `active` prop is true and the view is on screen.
  - **Service:** `services/pose` (`getPoseCamera`: availability, permission read/request, the view). Unavailable on Android, web, Expo Go and older builds, so the option isn't offered.
  - **Shared engine (pure, tested):** `fitness/pose/verifier.ts`. Frames go in; reps, movement state and feedback come out.
    - **Readiness:** only the joints the activity needs, held for ~0.4 s.
    - **Side:** one-sided activities use the clearer side and keep it for the rep (no flapping).
    - **Values:** confidence ≥ 0.3; light smoothing (each new value moves the average 60%).
    - **Evidence:** each activity has weighted evidence paths in groups. A rep reaches its target when the reached paths add up to 1, with only the best path per group counting. One strong path is enough, or several supporting ones together.
    - **States:** home → leaving → away → home = 1 rep. Activities may start at either end (sit-to-stand). The start position is judged by the primary paths (weight 1) when visible, so supporting measures that depend on body proportions can't block it.
    - **Speed:**
      - a cycle under 0.2 s is a glitch (silent);
      - under the activity's minimum, or with the target only glimpsed for one frame, it says "A little slower so I can count the full movement";
      - a quick movement whose unsmoothed value holds the target for 2 frames counts.
    - **Automatic start:** `steadyFor` (usable, ready and still, with joints moving under 3% of the image per frame) and `autoStart` in `camera-flow.ts`: ~1 s still → the mission countdown starts; the pose lost during the countdown cancels it (`cancelCountdown`); nothing cancels after Go.
    - **Ends:** a dead zone between them; a minimum cycle per activity that blocks glitches, not brisk genuine reps.
    - **Losing the body:** after 0.8 s the rep in progress is dropped. Completed reps are never removed.
    - **Feedback:** partial reps and stalls give the hint of the most important missing path ("Lower a little more", "Bring your feet back together").
  - **Activities** (`fitness/pose/camera-activities.ts`): each one only describes its movement. Every measurement comes from one frame, scaled by the user's own body lengths, so there's no calibration and side-on isn't strictly required.

    | Activity | States | Primary evidence | Secondary evidence | Minimum landmarks | Min cycle |
    |---|---|---|---|---|---|
    | Push-ups (front, side or angled) | top → down → top | Shoulder height above the hands in forearm lengths, ≥1.75 → ≤1.5 (1; any view), **or** elbow angle ≥145° → ≤120° (1; side-on) | Elbow hidden, side-on: shoulder height in torso lengths ≥0.82 → ≤0.7 (0.6) **and** hip height ≤0.28 (0.4) | One side: shoulder + elbow + wrist (or shoulder + wrist + hip) | 0.35 s |
    | Squats | standing → squat → standing | Knee angle ≥155° → ≤120° (1) | Hip height above the ankle, in shin lengths, 1.85 → 1.65 (0.7), **with** a knee bend ≥160° → ≤145° (0.3) **or** shoulder height (0.4) | One side: hip + knee + ankle | 0.35 s |
    | Jumping jacks | closed → open → closed | — (arms and legs both needed) | Arm angle at the shoulder, both sides averaged, ≤60° → ≥110° (0.6) **and** feet spread (0.6), or knees spread if the feet are hidden (0.5) | Both shoulders + both hips + a wrist + both ankles (or both knees) | 0.25 s |
    | Chair sit-to-stand | standing ↔ seated (either start) | Knee angle ≥145° ↔ ≤115° (1) **or** hip height 1.7 ↔ 1.35 (1) | — | One side: hip + knee + ankle | 0.8 s measured (≈1.3 s real) |

    The head is never used. Leaning forward, small dips, bouncing, one arm or feet alone never complete a rep.
  - **Classification of the whole catalogue:** `CAMERA_CATALOGUE` (enabled / later / not suitable, each with a reason). The Non-physical profile is never offered the camera.
  - **Mission:** `camera-verification-view.tsx` inside `FitnessMissionView`. Camera reps go through `recordCameraRep` → `recordRep` (with the activity's own minimum cycle), so completion, XP and occurrence rules are unchanged. `verification: 'camera_verified'` is set only when every rep was camera-counted.
  - **Why Apple Vision:** it's built into iOS (no download, licence or model file), runs on device, needs only a small local module, and its 2D joints are enough for angle-based reps. Alternatives considered:
    - MediaPipe Pose: more landmarks and Android reuse, but adds model files and a pod;
    - ML Kit Pose: Google's closed SDK, larger and still beta;
    - VisionCamera frame processors: an extra worklets dependency and community pose plugins of mixed quality.
    The counters take a generic joint format, so Android can use another detector later.
- **Faith (Phase 3C):** `src/features/faith/`. Separate missions, each Faith XP once per occurrence: `{ type: recitation, tradition }`, `{ type: reflection, difficulty }` (difficulty = length), and `{ type: recitation_reflection, tradition, difficulty }` (Recitation then Reflection, one occurrence; `combined.ts`). `completeMission` only accepts a result of the alarm’s own mission type. Later Reflections on the same day are alternates (`reflection/sessions.ts`). Details: [FAITH-CONTENT.md](FAITH-CONTENT.md), [REFLECTION-MUSIC.md](REFLECTION-MUSIC.md).
  - Faith settings (primary preference, explore other traditions, display) in `app_settings`; private (`privacy.ts`); backed up to the private profile by the sync engine’s `profile` entity.
  - Daily schedules (`schedule.ts`): explicit entries + rotations, stored as layers so a newer schedule never changes past/today/tomorrow.
  - Recitation text via `FaithContentProvider` (`recitation/content.ts`), cached exactly in `faith_content_cache` (migration 9, checksum). `RecitationLibrary.forMission` never touches the network (cache → local fallback); `prepare` prefetches; `open` serves the Recitation archive (`recitation/archive.ts`; Recitation only).
  - Reflection music via `ReflectionMusicProvider` (bundled/cached → download → stream → fallback), files in `src/services/file-cache`, playback in `src/services/audio` (expo-audio: silent-mode playback, exclusive audio focus, no background audio).
  - `createFaithServices` wires it all; `faith.ts` / `faith.web.ts` pass the platform pieces; `useFaithPrefetch` (root layout) keeps today and tomorrow on the phone.

## Today, alarm creation and results (Phase 3.5)

- **Saved alarms vs occurrences.** Saved alarms (configuration) decide what is scheduled: Today's rows, Next alarm, the weekly schedule and Manage. Occurrences (snapshots of what happened) decide history: Progress, Recent mornings, XP and streaks. Today attaches today's occurrence to its saved alarm's row for state only, so deleting an alarm never leaves a ghost row and never deletes history. `alarmStore.remove` cancels the native alarm and snoozes; `onRemove` closes the open morning and its Gentle reminder.
- **Today row action** (`todayAlarmAction` in `today.ts`) resumes the mission only when `canResumeMission`, otherwise edits. The weekly schedule (`today/weekly-schedule.ts`, screen `today/week`) is built from active alarms only.
- **Today** (`features/today`): `buildToday` is a pure function of the saved alarms and today's occurrences. It gives the schedule with statuses, the next alarm (`nextRingAt`) and the morning status (Main Wake-Up only). `useToday` adds the streak, XP and rank snapshot. `showToday()` is the shared way back to Today.
- **Creation** (`features/alarms/creation.ts`):
  - The steps are data (`CREATION_STEPS`), so a routine step (`RoutineContext`: morning / day / night) can be inserted in Phase 4.
  - `categoriesFor` and `missionChoices` follow the Mobility Profile and Faith settings. `draftFromCreation` applies `ALARM_DEFAULTS` (`alarm-defaults.ts`, which `createAlarmDraft` also reads).
  - `missionControls` drives the editor's progressive disclosure.
  - `saveAlarm` is the one save routine.
- **Morning and Main Wake-Up** (`features/alarms/morning.ts`): `MORNING_WINDOW` (prototype 03:00–11:00) and `routineContextFor`, which an explicit routine will replace later. `mainWakeUpDecision` / `applyMainWakeUpChoice` handle the question asked when a new morning alarm is saved (`saveNewAlarm`). The Main Wake-Up is never a default. A one-off morning alarm is a one-time alarm (`weekdays: []`), which already turns itself off after ringing.
- **Snooze** (`features/alarms/snooze.ts`, Main Wake-Up only): `snoozeSchedule` gives every ring of ONE alarm (interval × `maxSnoozes`, wrapping past midnight). The Preview shows it, and `snoozeOffsetsFor` sends its offsets to the native alarm.
  - iOS (`NativeSnooze.swift`, `TerbitSnoozeIntent`): the alarm's one custom button is Snooze while snoozes remain. The intent stops the ring and schedules the next one as a one-time AlarmKit alarm (record kind `snooze`, with `snoozeIndex` and `originAt`), with no JavaScript involved. The last ring gets the mission button instead, which enforces the maximum.
  - JavaScript: snooze rings never become fire events. `alarmKitFireEvents` ignores Snooze taps as stops, so they stay one morning. `handOff.syncSnoozes` records `snoozeCount` on that morning, cancels rings no longer wanted, and keeps the next ring for Today.
  - Edit, disable, delete and replace re-schedule or cancel natively, which cancels pending rings.
- **Main Wake-Up per day** (`features/alarms/main-wake-up.ts`). The business rules live in one file:
  - `resolvedMainWakeUp(alarms, date, recorded?)` gives 0 or 1 alarm: a one-off on that date wins (also after it rang and turned itself off), otherwise the repeating Main Wake-Up for that weekday. It is used for Today, the weekly schedule, the `isMainWakeUp` snapshot recorded when an alarm rings (so streaks), simulate, and snooze ownership (`snoozeNoLongerWanted`).
  - `mainWakeUpOverlaps` and `resolveMainWakeUpOverlaps` (`{update, remove}`): partial overlaps subtract days, full overlaps delete. The alarm store applies them on save via `remove`.
  - `legacyMainWakeUpFixes` runs on every load: it reconciles older overlapping data without deleting anything.
  - Helpers: `oneOffRingAt`, `isExpiredOneOff`, `isActiveAlarm`, `ringsOnDate`, `nextRingAt`.
  - A one-off's date comes from its `updatedAt`, which `disableAfterRinging` keeps unchanged. The question asked before saving is in `morning.ts` (`mainWakeUpQuestion`), with its wording in `main-wake-up-prompt.ts`.
- **Navigation back to Today:** inside a tab, `showToday()`; from the full-screen alarm screen, `returnToToday()` (a single `router.dismissTo('/today')`; `dismissAll` + `navigate` could push the tabs on top of the modal).
- **Results** (`features/missions/result-layout.tsx`, `mission-result-summary.tsx`, `progress/result-progress.ts`): one layout for alarm and practice results, with rank changes computed from `rankFor` before and after the gained XP.

## Night Routine and Screen Time (Phase 4, verified on iPhone 13 Oct 2026)
- **Model and rules (pure, tested):**
  - `features/night/night-routine.ts`: the model, defaults, validation, `nightRoutineFromAnswers`.
  - **Restrictions start at wind-down** (`restrictionStartTime`): wind-down is the one source of truth. There is no separate restriction-start setting, simple or advanced.
  - **Bedtime starts nothing:** there is no native event at bedtime. It is the sleep target and anchors `availableSleepWindow` (`night-timeline.ts`: bedtime → the relevant Main Wake-Up, null without one). That is a planning figure, never "sleep".
  - `night-timeline.ts`: night windows (a night belongs to its evening), `restrictionEnd` (THE end policy: next morning's `resolvedMainWakeUp`, else the fallback), `restrictionState`, `tonightItems`, and `nativeRestrictionPlan` (what the phone schedules).
- **Storage:** `night-repository.ts` (SQLite `night_routines`, JSON config, migration 12; never synced).
  - Routines saved by earlier Phase 4 builds may hold a `restrictionStart` key. It is ignored on read and dropped on the next save. Everything else is kept, and those routines now restrict from wind-down. No SQL migration is needed (the config is JSON).
- **Store:** `night-store.ts` saves first, then syncs the Screen Time plan and the wind-down reminders.
- **Wiring:** `night.ts` re-syncs on every hand-off run (app open or foreground) and when alarms change.
- **Service:** `services/screen-time` → local module `modules/terbit-screen-time` (iOS 16+):
  - `requestAuthorization(for: .individual)`;
  - Apple's `FamilyActivityPicker` (only opaque tokens reach Terbit MY);
  - `ManagedSettingsStore(named: "terbit.night")` shields;
  - `DeviceActivityCenter` schedules.
- **Extension** `targets/activity-monitor` (Device Activity Monitor, via `@bacons/apple-targets`): iOS calls it at each schedule's start and end with Terbit MY closed. The shield rules are in `NightShield.swift`; the app and the extension hold identical copies, which a test checks. They share `group.com.terbitmy.app` (selection, override, state).
- **Schedules:**
  - One repeating DeviceActivity schedule per night (`terbit.night.<weekday>`, start weekday → next weekday). It **starts at wind-down** and ends at that weekday's *repeating* Main Wake-Up, so it keeps working if Terbit MY isn't opened.
  - The extension's `intervalDidStart` applies the ManagedSettings shield, and `intervalDidEnd` removes it. The Swift side is time-agnostic: it schedules exactly the start and end computed in TypeScript.
  - A wind-down after midnight (e.g. 00:15) starts on the next weekday.
  - A one-off Main Wake-Up that's earlier than usual adds a dated `terbit.night.end.<date>` marker that ends that night early.
  - Schedules are restarted only when their signature changes.
- **Notifications (Apple limitation, checked against Apple's documentation, Oct 2026):**
  - `ManagedSettingsStore` has no notification setting. Its groups are account, appStore, application, cellular, dateAndTime, gameCenter, media, passcode, safari, shield, siri and webContent.
  - `ShieldSettings` covers apps and websites "with a shielding view". Its documentation says nothing about notifications.
  - `UserNotifications` only manages the calling app's own notifications.
  - Focus filters (`SetFocusFilterIntent` / `FocusFilterAppContext`) filter only the *implementing* app's notifications. Apps can't turn on a Focus or choose which other apps a Focus silences.
  - **So Terbit MY never promises to block or silence other apps' notifications.** The UI says "Apps restricted", separately from "Notifications: Not changed by Terbit MY" (`NOTIFICATION_INFO` in `features/night/labels.ts`). It recommends an iPhone Focus such as Sleep for a completely quiet wind-down.
  - Some developers report that shielded apps' notifications are suppressed too. Apple doesn't document this, so it is treated as incidental, never promised.
  - No private APIs, settings URLs (`App-prefs:`) or automation hacks are used; a test checks this.
- **Build switch:** `app.config.js` adds the Family Controls entitlement, App Group, Info.plist flag and the extension only with `TERBIT_SCREEN_TIME=1` (eas.json profile `development-screen-time`; Apple approved Family Controls Distribution for both bundle IDs). Without it the module reports `not_configured` and nothing native is attempted.

## Settings, permissions and accessibility (Phase 3D)

- **Settings index** (`features/settings/settings-index.ts`): groups → one sub-screen per page under `src/app/(tabs)/settings/`. Each setting lives on one screen only. Developer tools are a single development-build-only screen.
- **Preferences** (`features/settings/preference-store.ts`): small typed groups in `app_settings` (`accessibility.settings`), normalised on read, phone-only (never synced). Faith keeps its own store.
- **Notifications** (`features/notifications/notification-catalogue.ts`): alarm-critical (AlarmKit, not a preference) vs mission reminders (Gentle follow-ups: part of Gentle mode, automatic, no switch; Reward and Challenge never send them) vs optional engagement (planned; they become preferences when built).
- **Permissions** (`services/permissions` reads/requests; `features/permissions` maps to plain statuses). Reading never asks; asking only on tap, and only if never asked. Unknown is shown as unknown, never as allowed. The microphone has no request path. The camera is asked for only from "Verify with camera" in a Fitness mission; Settings reads it and offers iPhone Settings. iPhone Settings opens with `Linking.openSettings()`.
- **Motion and text** (`services/accessibility`, `features/accessibility/system-preferences.ts`, `hooks/use-large-text`, `constants/text-scale`): iPhone preferences, not permissions. Read only, shown as "Follows iPhone setting" (plus the value when the iPhone reports one), with the iPhone Settings path as help; Terbit never opens Settings for them (no supported link). Reduce Motion → fade transitions; large text → stacked rows and list-style choices; display numbers capped at 1.5×.
- UX map and known issues: [UX-INVENTORY.md](UX-INVENTORY.md).

## Progression (Phase 2A, device-local)

`src/features/progress/` turns the morning history into XP, streaks, ranks and achievements, entirely on the phone.

```
alarm_occurrences (Phase 1, unchanged) ──► progress engine (progress-engine.ts)
                                              ├─ xpForMorning ─────────► xp_ledger     (unique award_key)
                                              ├─ reachedAchievements ──► achievements  (unique id) + bonus XP
                                              └─ summarise ────────────► Progress tab, "Morning complete"
```

- **Rules are pure functions** (`progression.ts`) built on `evaluateMorning()`: `rewardEligible` decides XP, `streakEligible` decides streak days. Each morning's `completionMode` is the mode it really rang with, already adjusted for the entitlement.
- **All numbers live in `policy.ts`** (`PROGRESSION_POLICY`): XP per mission type, mode bonuses, mission → discipline (Education / Fitness / Faith), rank thresholds, the streak gap rule and achievement definitions. Beta changes go there, never into screens.
- **Stored vs derived.** XP and achievements are stored, because a ledger keeps what was earned even if values change later. Streaks, ranks and totals are recalculated from occurrences and the ledger every time, so they can't drift out of sync.
- **Idempotent.** Every award has a unique key (`occ:<id>:mission`, `occ:<id>:mode_bonus`, `ach:<id>`) enforced by the database (`INSERT OR IGNORE`). `progress.sync()` can run on every resume, screen open or mission completion without ever awarding twice. Achievement bonus XP is derived from all unlocked achievements, so it's never lost if a run stops halfway.
- **Mornings vs all alarms.** Only the **Main Wake-Up Alarm** produces "mornings". Each occurrence stores `isMainWakeUp`, copied from the alarm's `isPrimary` when it fires and never re-read, so changing the main alarm later doesn't rewrite history. Migration 7 filled older rows in once, from each alarm's main setting at upgrade time. The summary keeps four things apart:
  1. **morning accountability** (`summary.morning`): scheduled and successful mornings and the morning streak, from Main Wake-Up occurrences only;
  2. **general accountability** (`summary.general`): every alarm, morning or evening;
  3. **discipline XP** (`xp.byCategory`);
  4. **general/bonus XP** (`xp.general`, achievement bonuses). `xp.total` = Education + Fitness + Faith + General/Bonus, exactly.

  A 7 PM fitness alarm earns XP and counts in general accountability, but never becomes a "morning". Morning achievements (first morning, streaks) need the main alarm; mission achievements count every alarm.
- **Streak day rule.** Main Wake-Up occurrences are grouped by the local calendar day they were due (`scheduledAt`, device time zone). A day succeeds if **any** of its mornings succeeded (at most one streak day per day, however many alarms). It stays pending while a morning is open, fails if it had only failed mornings, and is neutral otherwise. Neutral days (cancelled alarms, a mission-free alarm turned off) and days without alarms neither extend nor break a streak. `streak.maxGapDays` can optionally expire a streak after a long gap (off by default).
- **Developer reset** moves a "history start" setting forward and clears the ledger. Mornings stay in history but stop counting.

## Accounts & cloud (Phase 2B)

Optional accounts (email one-time code) and a private Supabase **backup** of the phone's canonical records: alarms, occurrences, XP ledger and achievements. The phone stays the source of truth, and alarm-time features never touch the network. Full details, conflict policy and setup are in [CLOUD.md](CLOUD.md).

- **Session (Phase 5A):** `services/cloud/supabase-cloud.ts` falls back to the saved session when Supabase can't refresh an expired token offline (`storedSessionUser`), and ignores the `INITIAL_SESSION` event. Only `SIGNED_OUT` means "no user". The account store marks an unexpected sign-out as `sessionEnded` ("Sign-in required").
- **Sync status (Phase 5A):** `local · pending · syncing · synced · offline · signin_required · error`, shown in plain words by `syncStatusLabel`. "Last synced" comes from `sync_state` (`lastSyncedAt`).
- **Live verification:** deferred to beta by owner decision (domain, SMTP, branded templates, live OTP, real-iPhone sign-in, two-account RLS, restore). See PROJECT_STATUS.md → Beta requirements.
- **Circles groundwork:** the user ID (`auth.users.id` = `profiles.id`) is stable. Shareable identity must be a separate allow-listed view or table, never `profiles` itself (it holds the private Faith preference).

## Circles (Phase 5B: membership foundation)

Status: ✅ complete and merged (14 Oct 2026). The schema is live and checked against the repository (`supabase/tests/circles_live_verify.sql`); the RLS check passes on the live project. Signed-in, end-to-end tests are a beta requirement.

Private, invite-only accountability groups. 5B is membership only; check-ins, feed and reactions (5C) and push notifications (5D) come later and must be explicit opt-in. Nothing private (alarms, mission history, streaks, XP, camera, Night Routine, Faith settings) is visible to other users.

```
Circles screens (src/app/(tabs)/circles: index, create, join, [id], name)
   └► features/circles: circles-store (state, offline cache, outcomes in plain words)
                         validation · messages · labels (pure, tested)
         └► services/cloud CirclesApi (supabase-cloud.ts → tables under RLS + 5 functions)
```

- **Two identities, never mixed.** `profiles` (private, owner-only: account name, time zone, Faith preference) and `circle_identities` (shareable: display name only). Circles code and SQL never read `profiles`; tests check both.
- **The server decides visibility** (RLS). Members see their Circles, those Circles' members and members' Circle names. Non-members and signed-out users see nothing; there's no directory.
- **Writes go through narrow paths.** Create, join, preview and new invite are server functions. Rename, delete, leave and setting your own name use owner-only or self-only RLS, with column grants.
- **Owner/member.** The creator is the one owner (a partial unique index). Members can leave; the owner deletes the Circle instead (transfer later). Deleting an account deletes the Circles it owns.
- **Local-first boundary.** The store follows the account but fetches only when a Circles screen is focused; start-up never imports Circles (tested). Failures affect Circles only. The last list and member names are cached in `app_settings` (`circles.cache`, per account), shown read-only offline, and removed at sign-out.
- Schema, RLS and invite details: [CLOUD.md](CLOUD.md) → "Circles (Phase 5B)".

## Personalisation & onboarding (Phase 6A)

_Complete and physically verified on iPhone (14 Oct 2026). The `/personalise` modal draws its own top bar (no native header), like the alarm screen._

"Tell us what you want to achieve, and we'll build an accountability routine around you." Personalisation turns a few answers into a **real** routine: ordinary saved alarms and the Night Routine, written through the normal stores. There is no separate onboarding-only schedule.

```
/personalise (full-screen modal, one route; steps are data)
   └► features/personalisation
        flow.ts        THE ORDER, progress, back/forward, skip (+ warn once), Adjust, resume
        baseline.ts    prefill from the phone (Faith, Mobility, Main Wake-Ups via resolvedMainWakeUp, Night Routine) + skip defaults
        recommend.ts   THE GOAL → MISSION POLICY (deterministic, existing catalogue only, Easy)
        plan.ts        THE SCHEDULE GENERATOR (answers → alarm drafts + Night Routine times), pure
        preview.ts     weekly preview (days grouped generically) + wind-down, bedtime, Available Sleep Window
        apply.ts       "what will change" + accept through alarmStore / nightStore / Faith / Mobility (idempotent)
        storage.ts     personalisation.state / .profile / .draft in app_settings (phone only)
        personalisation-service.ts   new vs existing install, auto-offer once, begin/resume, review, accept, skip all
```

- **Order (fixed):** 1 About you (gender, Faith, Mobility) → 2 Goals (Education, Fitness, Faith) → 3 Accountability mode per goal → 4 Morning / Afternoon / Night per goal → 5 Wake-up (weekday, weekend) + snooze → 6 Wind-down + bedtime → 7 Review ("Your Terbit plan" + weekly schedule) → "Use this routine" / "Adjust". Steps 3–4 are hidden when no goal is chosen.
- **Modes:** shown everywhere in the order Gentle → Reward → Challenge (`COMPLETION_MODES`; Reward stays the default). Explanations are built from `MODE_POLICIES` and `MISSION_WINDOW_MS`. Challenge is premium-capable: the entitlement layer decides (`isModeAvailable`); onboarding shows 🔒 and explains Terbit+ is coming, exactly like the alarm editor. No purchase flow.
- **Day parts:** users see Morning / Afternoon / Night; internally the existing `RoutineContext` (`morning` / `day` / `night`).
- **Recommendation policy** (`recommend.ts`, all Easy, 3 questions):

  | Category | Goal → mission |
  |---|---|
  | Education | General knowledge → General Knowledge quiz · Know the world → Geography · Vocabulary → Vocabulary · Challenge my thinking → Logic · Mental maths → Maths |
  | Fitness (Standard / Reduced mobility) | Move every day → Walk in place / Seated marching · More active → Jumping jacks / Step-out · Basic strength → Squats / Chair sit-to-stand · Loosen up → Stretch / Seated stretch |
  | Wake-up activity (Non-physical) | Calm → Controlled breathing · Focus → Number focus · Release tension → Hold and release · Grounded → Grounding |
  | Faith (with a tradition) | Recitation → Daily Recitation · Reflection → Reflection · Both → Recitation + Reflection |
  | Reflection (Non-religious / Prefer not to say / not chosen) | Daily reflection habit, Slow down → Reflection (no recitation or prayer wording) |

  A goal that no longer fits the profile or faith falls back to that category's first option. Camera counting is mentioned only when the activity is camera-enabled (never Non-physical). The Mobility Profile never changes XP. Future (6E): Free = Easy only, applied by the entitlement layer, not here.
- **Schedule generation** (`plan.ts`):
  1. Main Wake-Up: Mon–Fri + Sat–Sun alarms, or one every-day alarm ("same time"), or weekdays only ("no alarm" at weekends). Days never overlap, so each date has at most one resolved Main Wake-Up. Only these carry the snooze answer.
  2. The first Morning goal (Education → Fitness → Faith order) is the Main Wake-Up's mission and mode. Further Morning goals are ordinary alarms 15, 30… minutes later on the same days. No Morning goal: the Main Wake-Up has no mission.
  3. Afternoon / Night goals: ordinary alarms every day, at the chosen time or the suggestion (Afternoon 12:30; Night 30 min before wind-down, 21:00 without one). Same-time clashes are spaced 15 minutes apart.
  4. Sleep targets vs Night Routine: wind-down and bedtime are always saved as **personalisation targets** (`personalisation.profile.sleep`; the preview, the Available Sleep Window, the Night suggestion and future insights use them). They create or change a Night Routine **only** when the user turns on "Add a Night Routine" / "Update my Night Routine" (`answers.nightRoutine`, off at the start of every session). An existing routine is otherwise left exactly as it is; when updated, it keeps its apps, nights, end rule, activity and reminder.
  5. **Terbit+ readiness** (`plan-entitlements.ts`, no gating in 6A): the generator always builds the full routine; `planPlusReasons` tags each item with why it would need Terbit+ — `challenge` (`challenge_mode`), `extra_alarm` (any alarm except `wake:weekday`, the one basic alarm; `multiple_alarms`), `difficulty` (Medium/Hard; `all_difficulties`), `premium_content` (any premium feature the alarm's mission or sound needs, via `requiredFeatures`), `night_routine` (`night_routine`). Whether each is premium comes from the access policy, so 6E can mark "Terbit+" or limit the Free routine (Gentle/Reward, Easy, one basic alarm, no Night Routine) without changing the engine. The preview items carry these reasons as data; 6A shows no Terbit+ tags or paywall (Challenge keeps its existing 🔒).
- **Idempotent acceptance** (`apply.ts`): each generated alarm is remembered by its plan slot (`wake:weekday`, `wake:weekend`, `morning:<category>:<weekday|weekend>`, `goal:<category>`) → alarm id in `personalisation.state.generated`. A rerun updates those alarms in place, deletes generated alarms the new plan doesn't have (first, so the Main Wake-Up rule never trims Terbit's own alarms), and recreates any the user deleted. One Night Routine (`NIGHT_ROUTINE_ID`). The user's own alarms are untouched except for the existing Main Wake-Up replacement rule (`resolveMainWakeUpOverlaps`), which is shown under "What will change" and confirmed first. History, XP and streaks are never touched.
- **New vs existing installs:** the first time state is read, an install with no alarms, no history and no Night Routine is `new` and is offered onboarding once at launch (only when no alarm is opening; recorded immediately, so it never nags). Anything else is `existing`: never forced; Settings → Personalise Terbit. If the launch check is slower than `LAUNCH_WAIT_MS`, Today opens and the offer isn't made (Settings still has it).
- **Skip:** every step can be skipped; "Skip this step?" is asked once per step per session. Skipped values: no gender; Faith and Mobility unchanged; no goals; Reward; Morning; the current wake-up (or 06:30, 10 min × 3); no Night Routine change. Close = skip personalisation entirely (with its own warning); nothing changes.
- **Privacy / storage:** local only, guest-friendly, no network. `personalisation.profile` holds the only new personal data: gender, goals (goal, mode, part, time) and sleep targets (wind-down, bedtime). Faith and Mobility stay in their own stores and are written there only on acceptance (Faith keeps its existing private-profile backup). `personalisation.state` (audience, status, version, generated ids) and `personalisation.draft` (resume) are phone-only. None of these are synced (the sync engine reads only Faith) or visible in Circles; tests check both.
