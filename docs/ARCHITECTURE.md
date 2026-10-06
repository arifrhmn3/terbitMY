# Architecture

## Principles
1. **The device is the source of truth for anything time-critical.** Alarms, the current mission and today's XP are written to a local database first. Supabase is used for sync, backup and circles.
2. **Native features sit behind TypeScript interfaces.** Screens never call Swift or Kotlin directly. They call a TypeScript service, such as `alarms.schedule(...)`, which picks the iOS or Android implementation.
3. **Code is grouped by feature.** Each product area keeps its logic, state and UI together, so it can be built and tested on its own.
4. **No secrets in the app.** The app only holds the Supabase *anon* key. Row Level Security protects all data, and privileged logic runs in Supabase Edge Functions.

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
  getCapabilities(): Promise<AlarmCapabilities>; // status: 'not-implemented' | 'needs-permission' | 'ready'
  requestPermission(): Promise<'granted' | 'denied' | 'not-implemented'>;
  schedule(alarm: AlarmSpec): Promise<ScheduleResult>;
  cancel(alarmId: string): Promise<void>;
}
```

The iOS and Android modules will each implement this interface, in `ios-alarmkit.ts` and `android-alarm-manager.ts`; `index.ts` picks one by platform. Both are placeholders today that never claim an alarm was scheduled or fired, and the UI shows "Alarms can't ring yet". The full contract is in [NATIVE-ALARMS.md](NATIVE-ALARMS.md).

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
scheduled ─► started ─► mission_in_progress ─► completed
                 └─(no mission)──────────────► completed
any active status ─► dismissed | missed | cancelled
```

- `src/features/alarms/occurrence.ts`: pure state rules. Finished occurrences can never change.
- `src/features/alarms/occurrence-manager.ts`: trigger, start mission, complete, dismiss, mark missed (active for over an hour), cancel (alarm deleted).
- Duplicate protection on two levels. The database has `UNIQUE (alarm_id, scheduled_at)`, plus a partial unique index allowing only one active occurrence per alarm. Every status change is a compare-and-set (`UPDATE … WHERE status = <expected>`), so an occurrence completes at most once. Future XP must be awarded per occurrence ID, which makes double rewards impossible.
- `/alarm/[occurrenceId]` is the shared full-screen ringing screen. "Recent mornings" (`/alarms/history`) lists the latest 30 occurrences.

## Data model (first draft, Supabase)
- `profiles`: id, display_name, timezone, rank, created_at
- `alarms`: synced copy for backup; the device copy is authoritative
- `mission_completions`: user_id, alarm_id, type, score, completed_at
- `xp_events`: user_id, amount, reason, created_at (append-only; the total is derived from these)
- `circles`, `circle_members`, `circle_checkins`: membership is checked with RLS

Every table has RLS enabled. A user can only read their own rows, plus check-ins from circles they belong to.
