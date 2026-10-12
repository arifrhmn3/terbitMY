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
| Camera pose detection | Apple Vision / Google ML Kit, on the device, through a native module | Free; video never leaves the phone |
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
- `src/features/alarms/occurrence-manager.ts`: trigger, start mission, complete, dismiss, mark missed (active for over an hour), cancel (alarm deleted).
- Duplicate protection on two levels. The database has `UNIQUE (alarm_id, scheduled_at)`, plus a partial unique index allowing only one active occurrence per alarm. Every status change is a compare-and-set (`UPDATE … WHERE status = <expected>`), so an occurrence completes at most once. Future XP must be awarded per occurrence ID, which makes double rewards impossible.
- `/alarm/[occurrenceId]` is the shared full-screen ringing screen. "Recent mornings" (`/alarms/history`) lists the latest 30 occurrences.

## Missions (Phase 1 maths, 3A quizzes, 3B fitness, 3C faith)

`src/features/missions/` holds each mission's pure session logic and its screen. An alarm stores its mission as JSON (`AlarmMission`: `none`, `math`, or `quiz` with `category`, `difficulty` and `questionCount`), so new mission types need no schema change. A finished mission produces one `MissionResult` (Maths result, or a quiz result with `type: 'quiz'`). It goes through the same `completeMission` → accountability → progression path, so XP, the Challenge bonus, Main Wake-Up rules and backup all work unchanged.

- **Quiz content:** curated packs bundled with the app (`quiz/packs/*.ts`), always offline, never generated at runtime. The engine asks a `QuestionSource` for a topic and difficulty, so downloaded, topic or age-adapted packs can be added later as another source. Question IDs are permanent (`gk-e-002`); history refers to them.
- **Selection:** a seeded shuffle, preferring questions not in the "recently asked" list (300 IDs, stored in `app_settings`). When a pool runs short, the questions asked longest ago come back first.
- **Flow:** one question at a time. Choose, see right or wrong with a short explanation, then go to the next. The quiz completes after the last question whatever the score; the score is shown and kept for review.
- **XP:** in `PROGRESSION_POLICY`. Every quiz topic counts as Education; base XP per mission type, plus `difficultyBonusXp`, plus the existing `modeBonusXp`.
- **Fitness (Phase 3B):** `{ type: 'fitness', exercise, difficulty, adaptation? }`. It uses two reusable building blocks, rep-based (push-ups, squats, jumping jacks) and timed (stretch, walk in place), in `fitness/session.ts`. They are pure functions of timestamps, so backgrounding or a slow screen can't distort time.
  - Reps need one deliberate tap each; taps faster than `minRepIntervalMs` are ignored.
  - Timers run from the end of a 3-second countdown and can be paused.
  - Results are marked `self_reported`; there's no camera yet.
  - Targets and anti-tap limits live in `fitness/exercises.ts`.
  - XP counts toward Fitness.
  - `adaptation` and `reducedMobilityAlternative` reserve space for the accessibility options (Phase 3D).
- **Faith (Phase 3C):** `src/features/faith/`. Separate missions, each Faith XP once per occurrence: `{ type: recitation, tradition }`, `{ type: reflection, difficulty }` (difficulty = length), and `{ type: recitation_reflection, tradition, difficulty }` (Recitation then Reflection, one occurrence; `combined.ts`). `completeMission` only accepts a result of the alarm’s own mission type. Later Reflections on the same day are alternates (`reflection/sessions.ts`). Details: [FAITH-CONTENT.md](FAITH-CONTENT.md), [REFLECTION-MUSIC.md](REFLECTION-MUSIC.md).
  - Faith settings (primary preference, explore other traditions, display) in `app_settings`; private (`privacy.ts`); backed up to the private profile by the sync engine’s `profile` entity.
  - Daily schedules (`schedule.ts`): explicit entries + rotations, stored as layers so a newer schedule never changes past/today/tomorrow.
  - Recitation text via `FaithContentProvider` (`recitation/content.ts`), cached exactly in `faith_content_cache` (migration 9, checksum). `RecitationLibrary.forMission` never touches the network (cache → local fallback); `prepare` prefetches; `open` serves the Recitation archive (`recitation/archive.ts`; Recitation only).
  - Reflection music via `ReflectionMusicProvider` (bundled/cached → download → stream → fallback), files in `src/services/file-cache`, playback in `src/services/audio` (expo-audio: silent-mode playback, exclusive audio focus, no background audio).
  - `createFaithServices` wires it all; `faith.ts` / `faith.web.ts` pass the platform pieces; `useFaithPrefetch` (root layout) keeps today and tomorrow on the phone.

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

Planned later, with RLS and explicit opt-in sharing: `circles`, `circle_members`, `circle_checkins`. Membership is checked with RLS. Nothing private (alarms, mission history, streaks, XP, faith settings) is visible to other users unless the user explicitly shares it.
