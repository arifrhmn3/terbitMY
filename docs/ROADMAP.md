# Phased Implementation Plan

Each phase ends with a working app, passing checks, and a Git commit or pull request. Later phases are not started until the earlier one has been reviewed.

| Phase | Scope | Needs from you |
|---|---|---|
| **0. Foundation** ✅ *(complete, verified on iPhone via Expo Go)* | Expo SDK 57 + TypeScript project, Expo Router native tabs (Today, Alarms, Circles, Progress, Settings), theme tokens with light/dark, shared UI components, lint/typecheck/test scripts, CI, planning docs | — |
| **1. Alarms MVP (device-local)** | `expo-dev-client` + `eas.json`; local `terbit-alarms` module (AlarmKit on iOS 26+, notification fallback, Android `setAlarmClock` + full-screen alarm); alarm list/editor; ring screen; maths mission v1; SQLite storage | Expo account login; **Apple Developer Program**; a real iPhone (iOS 26+) for testing |
| **2. Progress & accounts** | XP, streaks, ranks engine (unit-tested); Supabase project, schema, RLS; Sign in with Apple/Google/email; offline outbox sync | Create a free Supabase project and paste its URL + anon key |
| **3. More missions, settings & privacy** | Quiz packs; faith recitation & reflection (offline content); fitness missions with on-device pose detection + non-camera alternative; full settings, permission centre, accessibility options, notifications | Decide faith content & reviewers |
| **4. Bedtime & restrictions** | Bedtime routine & reminders; iOS Screen Time (FamilyControls + extensions); Android UsageStats + bedtime screen; sleep analytics charts | **Request Family Controls (Distribution) entitlement** (start this during Phase 1, it can take weeks) |
| **5. Circles** | Create/join via invite link or code, check-in feed, reactions, privacy controls, push notifications via Edge Function | — |
| **6. Polish & release** | Bahasa Melayu localisation, onboarding, analytics review, store listings, privacy labels, Play declarations (exact alarm, full-screen intent), TestFlight & Play internal testing | Store accounts, screenshots approval |
