# UX inventory

A map of every screen and journey, with known usability issues. **It isn't a redesign.** It's the input for the dedicated UX/UI architecture phase.

Status: 13 Oct 2026. Phase 3D, **Phase 3.5 (Core UX Consolidation)** and **Phase 4 (Night Routine and Screen Time)** are verified on iPhone. **Phase 5B (Circles Foundation)** is complete (14 Oct 2026): the signed-out state is verified on iPhone; the signed-in screens are tested in beta (owner decision). Phase 3.5 resolved four issues: the Today placeholder, the complex alarm creation, where Recent mornings lives, and inconsistent results. Each is marked ✅ below.

## Tab roles

| Tab | Question it answers |
|---|---|
| **Today** | What am I doing today? |
| **Alarms** | What do I want Terbit to hold me accountable for? |
| **Progress** | How am I doing over time? |
| **Settings** | How should Terbit behave for me? |
| **Circles** | Who keeps me accountable? (Phase 5B: private groups and members only) |

## Navigation map

```
/ (launch)                          checks for a rung alarm → alarm screen, else /today
├─ (tabs)
│  ├─ today/                         Today: morning status, next alarm, today's schedule, daily practice, snapshot
│  │   └─ alarm/[id]                 edit an alarm from Today (stays in Today)
│  ├─ alarms/                        create: "What do you want to be accountable for?"
│  │   ├─ create/[category]          step 2: the category's missions
│  │   ├─ create/time                step 3: time → Save Alarm or Customise
│  │   ├─ [id]                       Customise (new) / edit (existing)
│  │   ├─ manage                     Manage alarms (list, on/off, edit)
│  │   ├─ missions                   Practice hub (same catalogues as creation)
│  │   ├─ practice                   practise one mission (no XP)
│  │   └─ faith/                     Faith hub: day (Daily Recitation), archive
│  ├─ circles/                       Circles: signed-out state, name prompt, list, Create / Join
│  │   ├─ create                     name a new Circle (you become the owner)
│  │   ├─ join                       invite code → Circle name → Join
│  │   ├─ [id]                       members, your role, invite (owner), rename / delete (owner), leave (member)
│  │   └─ name                       your name in Circles
│  ├─ progress/                      Progress
│  │   └─ history                    Recent mornings
│  └─ settings/                      Settings index and sub-screens (Phase 3D)
├─ alarm/[occurrenceId]              alarm screen (full-screen modal): alarm → mission → result
└─ alarm-fired                       Android hand-off link (not used on iOS)
```

## Screens

### Today (`today/index`) ✅ rebuilt in 3.5
- **Purpose:** the daily home. It's worked out from the saved alarms and today's mornings (`features/today/today.ts`).
- **Shows:**
  - **Morning card:** Morning ahead (with the Main Wake-Up time), mission waiting (with Finish mission), Morning complete with the streak, not completed, no Main Wake-Up today, or none set.
  - **Next alarm:** from the real schedule.
  - **Today's schedule:** in time order, each with its status (upcoming, mission waiting, completed, missed, not completed, earlier today).
  - **Daily practice:** today's Recitation only if a tradition is set; Reflection only if a faith preference is set; always "Practise a mission".
  - **Progress snapshot:** streak, today's XP and rank.
- **Key actions:** tap an alarm to edit it (stays in Today); tap a waiting morning to finish its mission.
- **Remaining:**
  - Practice and Faith links open in the Alarms tab's stack.
  - The schedule rows are plain list rows: no visual timeline yet.

### Alarms (`alarms/index`) ✅ rebuilt in 3.5
- **Purpose:** create accountability alarms, mission first.
- **Shows:** categories (Education, Fitness or "Wake-up activity", Faith), "Alarm without a mission", Manage alarms, Practice.
- **Removed:** the saved-alarm list (now in Manage alarms and on Today), Recent mornings (now in Progress), the mission rows (now in Practice), and the "coming soon" card.

### Creation flow (`alarms/create/*`) ✅ new in 3.5
- **Steps:** category → mission/activity (only that category's catalogue; Fitness follows the Mobility Profile; Faith follows the Faith settings) → time → **Save Alarm** (central defaults) or **Customise**.
- **Defaults:** `ALARM_DEFAULTS` (`features/alarms/alarm-defaults.ts`): Reward mode, Easy, 3 questions, Monday–Friday, snooze every 10 minutes up to 3 times, system sound. Never the Main Wake-Up by default.
- **Main Wake-Up:** saving a new alarm in the Morning window (prototype 03:00–11:00, `morning.ts`) asks one of two questions:
  - with no Main Wake-Up yet: "Make this your Main Wake-Up?" (Use as Main Wake-Up / Not now);
  - with one already: "You already have a Main Wake-Up at …" (Replace Main Wake-Up / Keep existing Main Wake-Up, which turns this alarm into a one-off morning alarm).
- **Routine-ready:** the steps are data (`CREATION_STEPS`, `features/alarms/creation.ts`). Phase 4 can insert a Morning / Throughout the Day / Night step in front (`RoutineContext`) without rewriting the flow. Nothing about routines is shown yet.
- **Remaining:** the category and mission steps are plain lists, not visual pickers.

### Alarm editor / Customise (`alarms/[id]`, `today/alarm/[id]`) ✅ reordered in 3.5
- **Order:** time → mission (only its own settings, via `missionControls`) → accountability mode (+ Gentle delay) → repeat → label / on / Main Wake-Up → sound → snooze (Main Wake-Up only: interval, maximum snoozes) → **Preview schedule** → Save.
- **Snooze on the alarm (iOS):** while snoozes remain, the alarm's custom button is Snooze; the last ring offers the mission. **Remaining issue:** on earlier rings, starting the mission means tapping Stop and opening Terbit (AlarmKit allows only one custom button). Development builds also have "Simulate alarm".
- **After saving:** a new alarm goes to Today; an edit goes back to where it came from.
- **Remaining:**
  - It's still one long page, with no collapsible sections.
  - Premium modes show a lock with no explanation in place.
  - The mission type can still be changed here with a 5-way segmented control.

### Manage alarms (`alarms/manage`) ✅ new in 3.5
Every saved alarm, grouped by mission (Education, Fitness or "Wake-up activity", Faith, No mission), then by time within each group. On and off alarms are both shown; tap to edit or delete. "New alarm" starts the creation flow.

### Alarm screen and results (`alarm/[occurrenceId]`) ✅ shared result layout in 3.5
- **Result layout** (`MissionResultLayout`), used by alarms and Practice:
  1. **Success:** "Mission complete".
  2. **Mission summary:** mission-specific, via `MissionResultSummary`.
  3. **Reward:** XP, its discipline, and each part (mission, difficulty, Challenge bonus).
  4. **Progress:** rank-ups, achievements, and the morning streak (Main Wake-Up only).
  5. **Action:** after a real alarm, "Back to Today" (goes to Today); a simulation shows "Done" and goes back.
- **Remaining:**
  - The quiz review sits inside the summary and can be long.
  - The XP breakdown is still a list of lines.

### Missions
Each mission has its own view (`features/missions/*`, `features/faith/*`).
- **Maths:** questions with a retry after each wrong answer.
- **Quiz:** answer, see feedback and the explanation, then Next.
- **Fitness:**
  - Rep taps, a timer, holds or number focus, from the Mobility Profile catalogue.
  - The "get ready" countdown is 3 s, or 10 s with Extended pacing.
  - **Verify with camera (Phase 4.5, verified on iPhone; optional):** offered only for push-ups, squats, jumping jacks and chair sit-to-stand. It never appears, disabled or otherwise, anywhere else. One camera permission covers all of them.
    1. On the ready card, "Start" stays and "Verify with camera" is added below it ("Optional: let the camera count your reps on this phone.").
    2. First time: "Count reps with the camera?", with "Terbit uses the camera to count exercise repetitions on your device. Video is not recorded or uploaded.", then Allow camera (the iOS prompt) or Continue without camera. Once allowed, it goes straight to positioning.
    3. **Positioning** (per activity; what worked on the iPhone):
       - Push-ups: "Place your phone about 2 m away. Front-facing or side-on both work. Keep your upper body and at least one arm clearly visible."
       - Squats: "Place your phone 2–3 m away so your hips, knees and ankles are visible. Face the phone or turn slightly sideways."
       - Jumping jacks: "Face the phone and step back until your arms and feet fit comfortably in frame (about 3 m)."
       - Sit-to-stand: "Place your phone 2–3 m away, level with the chair, so your hips, knees and ankles are visible. Side-on or slightly angled works best."
       - One fix at a time while not usable: "Step back a little — keep your feet in frame", "Keep one arm visible", "Keep your arms in frame", "Move into view".
    4. **Automatic start (no Start button; nobody walks back to the phone):** "Hold there" → held still ~1 s → "Ready · 3" → "2" → "1" → "Go" → live guidance. "Ready" means enough of the needed joints, not the whole body. Losing the pose during the countdown cancels it, back to positioning.
    5. **Live guidance** (neutral, never "bad form" or "incorrect"):
       - Push-ups: "Lower into the push-up" → "Keep going" → "Good — push back up" → "Rep counted".
       - Squats: "Lower into the squat" / "Good — stand back up".
       - Jumping jacks: "Jump out, arms up" / "Good — back together".
       - Sit-to-stand: "Stand up" / "Sit down slowly", depending on the starting position.
       - Partial reps don't count and say what's left: "Lower a little more", "A little lower", "Stand all the way up", "Raise your arms a little higher", "Jump your feet a little wider", "Bring your feet back together", "Straighten your arms". A plausible movement that's too quick to verify says "A little slower so I can count the full movement" (detector glitches are ignored silently).
    6. A live "8 / 10" count. Stepping out of frame never removes reps ("… to keep counting. Reps so far are kept.").
    7. At the target, the normal Fitness result shows "Counted by camera". If the user switched to tapping part-way, the reps so far are kept and the result is "Self-reported".
  - Camera access denied: "Camera access is off", with how to turn it on (iPhone Settings → Terbit MY → Camera), Open iPhone Settings, and Continue without camera. It's never asked again from here.
  - Unavailable or failed camera: a plain message, Try again (if it failed), and Continue without camera. "Continue without camera" is offered on every camera screen and keeps the reps so far.
  - Privacy note under the camera: "Counted on this phone. Video isn't recorded, saved or uploaded."
- **Faith:** Recitation pages; Reflection guided session; Recitation + Reflection in two steps.

**Remaining:**
- Headers and progress indicators still differ per mission.
- Abandoning is a small link below the mission.

### Practice (`alarms/missions`, `alarms/practice`)
- The Practice hub lists the same catalogues as creation.
- **Remaining:** development builds add a large developer section to the practice screen.

### Recent mornings (`progress/history`) ✅ moved to Progress in 3.5
Same screen and data as before (a navigation move, not a data migration). It's reached from Progress → Mornings → Recent mornings.

### Faith hub, Recitation day, Recitation archive (`alarms/faith/*`)
- **Remaining:** final Faith content placement is deferred.
  - Today links to today's Recitation and Reflection, but the content still lives in the Alarms stack.
  - Reflection still opens Practice with "Practice mode" wording.

### Progress (`progress/index`) 🟡 partly improved in 3.5
- **Shows:** mornings (streak, longest streak, successful mornings, Recent mornings), all alarms, XP by discipline, ranks, achievements, recent XP. The Sleep placeholder was removed.
- **Remaining:** it's still a long list with no visual hierarchy or summary header.

### Circles (Phase 5B, complete 14 Oct 2026; signed-out state verified on iPhone, signed-in screens in beta)
- **Tab states:** unavailable (no cloud in this build) · signed out ("Sign in to create or join Circles." → Settings → Account; nothing else is blocked) · loading · first visit: "How should people in your Circles see you?" (Display name) · list (name, member count, "Owner") · empty ("No Circles yet") · offline (banner, last known list) · error (banner, Try again).
- **Create:** Circle name (1–40 characters, duplicates allowed) → Creating… → the new Circle's detail screen; failures in plain words.
- **Join:** invite code (ABCD-EFGH; case, spaces and dashes ignored) → Continue → "Join this Circle?" with the name only → Join / Open Circle (already a member) / Use a different code. Messages: invalid code, already a member, too many tries, full, offline.
- **Detail:** name and member count, your role, members (Circle names only, "(you)", Owner). Owner: invite code + expiry, Share invite (share sheet), New code, Rename, Delete Circle (confirmation). Member: Leave Circle (confirmation). Offline: cached members with a "Not up to date" banner.
- **Your name in Circles:** edit the shareable name (separate from the private account name in Settings → Account).
- **Known gaps (later):** no ownership transfer or member removal; no deep-link invite; no avatar; Circles have no activity yet (5C).

### Settings (Phase 3D)
- **Index groups:** Account; Alarms & missions (Faith); Notifications (Reminders); Accessibility; Privacy & data (Permissions, Your data); Developer (development builds only); About.
- **Remaining:**
  - "Alarms & missions" has only Faith. Alarm defaults are a central policy, not a user setting.
  - Single-row groups make the index longer than its content.

## Core journeys

### A. Wake-up: alarm → mission → result → progress ✅
1. AlarmKit rings. The user taps "Stop & Open Terbit" (Reward/Gentle) or "Stop & Start Mission" (Challenge).
2. Terbit opens the alarm screen for that morning (launch hand-off).
3. The mission runs, then the shared result shows the summary, XP, rank and achievements, and streak impact.
4. **Back to Today:** Today shows the finished morning, the streak and today's XP.

### B. Create alarm: category → mission → time → Save / Customise ✅
- Alarms → category → mission → time → **Save Alarm** saves with the defaults, then Today shows the alarm.
- Or **Customise:** the full editor, starting from the same draft.

**Remaining:** saving a Gentle alarm asks for notification permission straight away (contextual, but abrupt).

### C. Daily app check: Today → status → upcoming → Progress ✅
Today shows the morning status, next alarm, today's schedule and statuses, daily practice, and the streak and XP snapshot, with links into Progress.

### D. Faith: preference → Daily Recitation / Reflection → mission → archive
Settings → Faith (preference); Today → today's Recitation / Reflection; Alarms → Faith (Recitation / Reflection / Both); Alarms → Practice → Faith → Recitation archive.

**Remaining:** Faith content still lives in the Alarms stack, and the archive is deep.

### E. Account: guest → optional sign-in → sync
Settings → Account & backup → email code → signed in.
- **Guest:** "Continue without an account" (everything works on the phone), then "Sign in / Create account (optional)": email → "Email me a code" → 6-digit code → Sign in.
- **Signed in:** email, sync status ("Synced · Last synced 14:05", "Sync pending", "Offline · 2 changes will back up…", "Sign-in required", "Sync failed"; tap to sync now), display name, sign out, delete account.
- **Session ended by Supabase:** guest view headed "Sign-in required"; local data kept.
- **Not yet verified live (beta):** real email delivery, branded email and real-iPhone sign-in wait for the final name and domain (PROJECT_STATUS.md → Beta requirements). The signed-in screens are unit-tested only.

**Remaining:**
- No onboarding yet (Phase 6).
- Sign-in is only discoverable from Settings.
- Restore to a new phone isn't built.

## Duplication found (and what was done)

| Duplication | Resolution |
|---|---|
| Developer panels spread over Alarms, Progress and Account | 3D: Settings → Developer tools |
| Placeholder settings pages | 3D: replaced by working screens |
| Fitness accessibility per alarm vs a user need | 3D: one Mobility Profile with its own catalogues |
| A Gentle follow-up switch duplicated the choice of mode | 3D: removed |
| Recent mornings (Alarms) vs Progress | 3.5: moved into Progress |
| Saved-alarm list on Alarms vs creation | 3.5: creation is primary; the list is Manage alarms, and today's alarms are on Today |
| Result code copied in the alarm screen and Practice | 3.5: one `MissionResultLayout` + `MissionResultSummary` |
| Defaults spread between `createAlarmDraft`, the editor screen and the first-alarm rule | 3.5: `ALARM_DEFAULTS` |
| Faith content (Alarms → Faith) and settings (Settings → Faith) | Kept separate. Final placement is deferred |

## Accessibility review (Phase 3D, still applies)
- **Large text:** rows stack their value; 3+ option choices become lists; weekday buttons grow; display numbers are capped at 1.5×. New 3.5 screens use the same rows, and Save Alarm / Customise wrap side by side or stack.
- **Reduce Motion:** screens fade instead of sliding.
- **Still to review:**
  - VoiceOver order on mission screens;
  - dark-mode contrast of secondary text;
  - haptic and visual alarm cues;
  - larger weekday touch targets.

## Main Wake-Up rule (3.5)
**One Main Wake-Up per calendar day.** Several alarms may be Main Wake-Ups (for example Mon–Fri 06:30 and Sat–Sun 08:00) if their days don't overlap.
- **Overlaps:** turning one on, or a new morning alarm, asks before taking over days.
  - **Partial:** "Replace Wednesday's Main Wake-Up" leaves the other alarm with its other days (several partial overlaps: each loses only its own overlapping days).
  - **Full:** the old alarm is **deleted**: its native alarm and any pending snooze rings are cancelled. Its past mornings, XP and streak stay in Progress. The prompt says so before you confirm.
  - **No overlap:** both stay; nothing is asked.
- **One-off override:** a one-off can be the Main Wake-Up for its date only ("Use 07:30 as this Wednesday's Main Wake-Up?"). The repeating alarm still rings that day but doesn't count as the morning.
- **Today and snooze:** Today shows one Main Wake-Up per date. Each Main Wake-Up keeps its own snooze settings; a replaced alarm's pending snooze is cancelled.
- **One resolver:** `resolvedMainWakeUp(date)` (`main-wake-up.ts`) decides the date's Main Wake-Up for Today, the weekly schedule, the morning snapshot recorded when an alarm rings (and so streaks), simulate, and snooze ownership.
- **Older builds:** overlapping Main Wake-Ups saved by earlier builds are fixed when alarms load, without deleting anything. The most recently saved alarm keeps the shared days. An older one loses only those days, or, if none would be left, stays saved (same days, same on/off) as an ordinary alarm. An alarm that an earlier 3.5 build turned off during a replacement stays turned off in Manage; delete it there if you no longer want it.

## Today, the weekly schedule and history (3.5)
- **Today shows active saved alarms, not history.** Rows come from saved, turned-on alarms that ring today. Today's mornings only add state to them: Upcoming · Mission waiting · tap to finish · Completed · Not completed · Missed. A deleted or turned-off alarm leaves Today straight away, even if it rang this morning; its morning stays in Progress → Recent mornings.
- **Tapping a row** (`todayAlarmAction`) resumes the mission only if the alarm rang, still exists, has a mission, the mission isn't done, and its completion window is open. Otherwise the alarm editor opens.
- **Completion windows** (`completion-policy.ts`):
  - Reward: 2 hours after the alarm.
  - Gentle: until midnight that day (the follow-up reminder is separate).
  - Challenge: 1 hour.
  - Reward and Challenge add any time spent snoozing.
- **Next alarm** ignores deleted, turned-off and already-rung one-off alarms.
- **Weekly schedule** (Today → View weekly schedule, `today/week`): the next 7 days of active alarms only. Repeating alarms appear on each weekday and upcoming one-offs on their date, in time order. Each day has at most one Main Wake-Up, and tapping an alarm opens it for editing. Days are already split into sections, so Morning / Day / Night can be added later.
- **Words** (`today/labels.ts`, `MAIN_WAKE_UP_TAG`, `ONE_OFF_TAG`): Main Wake-Up, One-off (also in Manage alarms).

## Night Routine (Phase 4) ✅ verified on iPhone (13 Oct 2026)
- **Where:** Alarms → Routines → Night Routine (`alarms/night`), the one place it's edited. Morning and Throughout the Day can join the Routines section later.
- **The rule:** chosen apps are restricted from **wind-down** (not bedtime) until the Main Wake-Up. Wind-down exists to remove distractions before sleep.
- **Terms:**
  - **Wind-down:** the start of the digital quiet period. The chosen apps are restricted, the optional calming activity becomes available, and the reminder may fire. It is not bedtime.
  - **Bedtime:** the intended sleep target. Nothing new starts here; restrictions simply continue. It anchors the Available Sleep Window.
  - **Main Wake-Up:** the normal end of restrictions. With no Main Wake-Up that morning, restrictions end at the fallback morning time.
  - **Available Sleep Window:** the most sleep the plan allows, from bedtime to the relevant Main Wake-Up (23:00 → 06:30 = 7h 30m). It is never called sleep, hours slept, actual sleep or sleep quality. A helper exists (`availableSleepWindow`); nothing shows it yet.
- **Setup (simple):** wind-down time (apps are restricted from here) → bedtime → apps to restrict (Apple's picker) → optional calming activity → Save. There's no separate "restrictions start" time.
  - Customise adds nights, the end rule (Main Wake-Up or fixed time), the fallback morning time, the wind-down reminder, and on/off.
- **Quiet notifications:** a separate section with the row "Notifications · Not changed by Terbit MY".
  - Footer: "Terbit MY restricts opening the apps you choose. It can't turn off other apps' notifications or turn on a Focus for you. Optional: for a fully quiet wind-down, set up Sleep Focus to start at the same time as your Terbit wind-down (22:30). iPhone Settings → Focus → Sleep."
  - Supportive, never required. "Notifications blocked / disabled / silenced by Terbit" is never claimed, and neither is automatic Focus (Apple has no API for either; a test scans the screens).
- **Today → Tonight:**
  - Rows: "22:30 · Wind-down begins · Apps restricted" → "23:00 · Bedtime" → "06:30 · Main Wake-Up tomorrow · Restrictions end".
  - With no Main Wake-Up, or a fixed end time, a separate "Restrictions end" row appears, plus "No Main Wake-Up tomorrow".
  - Heading while active: "Tonight · Wind-down active" from wind-down, then "Tonight · Bedtime" after bedtime. The footer stays "Apps restricted until 06:30" throughout, the same period. Before wind-down: "Apps restricted from wind-down (22:30) until 06:30".
  - It's shown first during wind-down and the night. Calming activity during wind-down: Reflection / Meditation or Guided breathing (Practice, no XP, never required, no religious content needed).
- **Without a routine:** a single "Set up a Night Routine" row.
- **Weekly schedule:** one Night Routine line per evening ("22:30 · Night Routine" / "Apps restricted from wind-down · Bedtime 23:00 · Ends 06:30").
- **Ending tonight early:** Night Routine → "End tonight's restrictions…" (available from wind-down) → confirm "End for tonight" (the default button keeps them). This removes tonight's shields only. The routine and its schedule are kept, and restrictions come back at the next wind-down.
- **Wind-down reminder:** "Time to wind down · Bedtime is 23:00. Your chosen apps are restricted from now." The second sentence appears only when Screen Time can actually restrict.
- **Future (not built in Phase 4):**
  - **Onboarding:** recommend "For a completely quiet wind-down, set up an iPhone Focus or Sleep Focus that silences notifications."
  - **Sleep Focus helper (App Shortcut / Shortcuts automation):** help the user configure Sleep Focus once, so that iOS turns it on at the same time as wind-down. Terbit MY must still never claim it turns on a Focus itself. No private APIs.
  - **Night analytics:** Available Sleep Window, late-night screen activity, Night Routine adherence, screen-free overnight window. Actual sleep only if Apple Health (or another reliable sleep source) is integrated later. No charts or sleep scoring yet, and no new Screen Time usage data is collected for this.
  - *Trade-off:* deliberate (two steps, clearly worded) but never punitive. There are no timers or penalties, and access can always be removed in iPhone Settings → Screen Time.
- **Settings:** Night & Screen Time → Screen Time access (status, allow, recovery). Permissions links there; Your data explains it.

## Deferred to the UX/UI phase
- **Onboarding and personalisation:** weekday and weekend wake times, snooze preference, Faith, Mobility Profile, Education and Fitness interests, accountability preferences.
- **Routine selection:** Morning / Throughout the Day / Night in alarm creation.
- **Final visual/UI redesign** and **final Faith content placement.**
- **Non-physical activity naming:** these activities currently earn Fitness XP; a neutral name is still to be decided.
- **More camera-verified activities** (Phase 4.5 covers push-ups, squats, jumping jacks and chair sit-to-stand). Deferred for reliability testing: wall push, step-out movement, walk in place and seated marching (continuous-movement mode). Also a possible Challenge-mode rule (recommended / required / verified badge).
- **Night Routine follow-ups:** a Sleep Focus setup helper (App Shortcuts / Shortcuts), Available Sleep Window analytics, possible Apple Health sleep integration (see "Night Routine" → Future).
- **Android parity** (phase A) and **Circles check-ins, feed and notifications** (Phases 5C/5D).
- **Weekly schedule sections:** Morning / Throughout the Day / Night sections in the weekly view (the structure is ready; `sectionOf` in `weekly-schedule.ts`).
- **Skipping one ring (AlarmKit limitation):** a one-off Main Wake-Up override doesn't silence the usual repeating alarm that date. AlarmKit can't skip a single day of a repeating alarm, so it still rings physically, but it isn't the Main Wake-Up and doesn't count as the morning. An option to silence it needs calendar-based scheduling later.
- Final Faith content placement (Today, its own area, or a tab).
- Final tab and navigation architecture (cross-tab links from Today).
- Morning / Throughout the Day / Night routine selection (not built in Phase 4, which added the Night Routine only; the creation flow is ready for it).
- Onboarding (Phase 6), including the Mobility Profile question (`MOBILITY_PROFILE_OPTIONS`).
- The final visual system: a timeline on Today, visual mission pickers, Progress hierarchy, result styling.
- Naming and category for non-physical activities. They earn Fitness XP so accessibility isn't penalised; a neutral name such as "Wellbeing", or a separate discipline, is still to decide.
