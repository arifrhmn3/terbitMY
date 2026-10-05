# Terbit MY — Product Requirements (v0.1)

*"Terbit" is Malay for "to rise". Working name.*

## 1. Problem
People who want a disciplined morning usually lose it the night before. They scroll late, sleep badly and then snooze the alarm. Ordinary alarm apps can be dismissed half-asleep, and habit apps give no reason to keep going.

## 2. Vision
One app for the whole loop: **wind down → sleep → wake with purpose → prove it → stay accountable**.

## 3. Target users
| Persona | Need |
|---|---|
| Student / young professional (primary) | Stop scrolling at night and stop snoozing |
| Faith-motivated riser | Wake for Subuh / Fajr and start with recitation and reflection |
| Fitness-focused | Start every day with movement |
| Accountability seeker | A small private group that notices when they slip |

Launch market: Malaysia. English first, Bahasa Melayu second. The architecture supports other locales.

## 4. Goals and success measures
- **G1 Wake reliably:** at least 99% of scheduled alarms ring on time on supported OS versions.
- **G2 Get out of bed:** at least 70% of alarms are dismissed through a completed mission rather than an escape hatch.
- **G3 Build habits:** 30-day retention of at least 25%; median streak of at least 5 days.
- **G4 Sleep earlier:** median bedtime moves earlier after 4 weeks of use (self-reported and from app data).

## 5. Feature requirements
Priority: **P0** is the minimum viable product, **P1** comes soon after launch, **P2** is later.

| # | Feature | Priority | Key requirements |
|---|---|---|---|
| F1 | Native smart alarms | P0 | Scheduled on the device; ring through silent mode where the OS allows; repeat by weekday; one optional snooze; work offline |
| F2 | Maths and quiz missions | P0 | Difficulty levels; answers are generated on the device; works offline |
| F3 | Fitness missions | P1 | Rep counting with the camera (pose detection on the device) plus a non-camera alternative (shake or step count) |
| F4 | Faith missions | P1 | Read or recite a chosen passage, then a reflection prompt; content pack is downloaded once and kept offline; voice check is optional |
| F5 | XP, streaks and ranks | P0 | Points for missions completed and bedtimes kept; streak freezes; rank ladder |
| F6 | Private circles | P1 | Invite-only groups of 2–12 people; member chooses what to share; check-in feed; reactions |
| F7 | Night-time app restrictions | P1 | Bedtime window that shields chosen apps (iOS Screen Time API; Android as feasibility allows) |
| F8 | Bedtime routine and analytics | P1 | Wind-down checklist and reminders; weekly charts of bedtime and wake-up consistency |
| F9 | Settings | P0 | Account, notifications, privacy and permissions, accessibility, data export and deletion |

## 6. Non-functional requirements
- **Offline first:** alarms, missions, XP and streaks work with no network and sync later.
- **Privacy:** camera and microphone are optional, asked for only when a mission needs them, and processed on the device. Nothing is uploaded. The app collects as little data as possible and the user can delete their account.
- **Security:** no secrets in the app. Supabase Row Level Security on every table. Anything privileged runs in Edge Functions.
- **Accessibility:** every physical or audio mission has an alternative. Supports Dynamic Type, VoiceOver/TalkBack and reduced motion.
- **Cost:** free tiers and open source only. No paid third-party SDKs.
- **Platforms:** iOS first (iOS 17+, with best alarm behaviour on iOS 26+); Android 10+.

## 7. Out of scope (for now)
Wearables, smart-home integrations, a public social feed, paid subscriptions, a web app beyond a preview build.

## 8. Open questions
1. Final name and bundle identifier. The placeholder is `com.terbitmy.app`; it must be fixed before the first store build.
2. Faith content: which texts, which translations, and who reviews them.
3. Monetisation, if any, after the MVP.
