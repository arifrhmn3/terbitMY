# UX inventory (Phase 3D)

A map of every screen and journey as built at the end of Phase 3, with known usability issues. **It isn't a redesign.** It's the input for the dedicated UX/UI architecture phase.

Status: 12 Oct 2026, end of Phase 3 (3D verified on iPhone).

## Navigation map

```
/ (launch)                          checks for a rung alarm → alarm screen, else /today
├─ (tabs)
│  ├─ today/                         Today            (placeholder content)
│  ├─ alarms/                        Alarms
│  │   ├─ [id]                       alarm editor (new / edit)
│  │   ├─ history                    Recent mornings
│  │   ├─ practice                   practice any mission (no XP)
│  │   └─ faith/                     Faith hub
│  │       ├─ day                    one day's Daily Recitation (reading)
│  │       └─ archive                Recitation archive (30 days)
│  ├─ circles/                       Circles          (placeholder, Phase 5)
│  ├─ progress/                      Progress
│  └─ settings/                      Settings index
│      ├─ account                    Account & backup
│      ├─ faith                      Faith
│      ├─ notifications              Reminders
│      ├─ accessibility              Missions, motion & text
│      ├─ permissions                Permissions
│      ├─ privacy                    Your data
│      └─ developer                  Developer tools (development builds only)
├─ alarm/[occurrenceId]              alarm screen (full-screen modal): alarm → mission → result
└─ alarm-fired                       Android hand-off link (not used on iOS)
```

Five tabs: **Today, Alarms, Circles, Progress, Settings.** Two of them (Today and Circles) are still placeholders.

## Screens

### Today (`today/index`)
- **Purpose:** the daily "what now" screen.
- **Entry:** the launch route, or the Today tab.
- **Key actions:** none yet. The rows are static.
- **Issues:**
  - **"Next alarm: Not set" and "Morning mission: None yet" are hard-coded,** so they're wrong when alarms exist. This is the most visible gap.
  - There's no accountability status for this morning: done, open, or Gentle reminder pending.
- **Consolidation:** make Today the hub for journey C. Show the next alarm and its mission, this morning's status with "finish mission", today's Faith practice, and a streak summary. Today should read data; Alarms and Progress keep the detail.

### Alarms (`alarms/index`)
- **Purpose:** the list of alarms, plus entry points to history, practice and Faith.
- **Key actions:** toggle an alarm, add an alarm, open Recent mornings, practise a mission, open Faith.
- **Issues:**
  - The tab mixes three jobs: managing alarms, browsing missions/practice, and Faith content.
  - The "Wake-up missions" section reads like settings but opens Practice.
  - A "coming soon" card for snooze is still shown.
- **Duplication:** Faith is reached from both Alarms → Faith and Settings → Faith. Those are content and settings, which is correct, but the two names look alike.
- **Consolidation:** possibly a "Missions" or "Practice" area, with Faith daily content moved to Today.

### Alarm editor (`alarms/[id]`)
- **Purpose:** create or edit an alarm.
- **Order today:** status → time → repeat → label → main wake-up → mission (type, then options) → "Try this mission" → accountability mode (+ Gentle delay) → sound → Delete. Development builds also have "Simulate alarm".
- **Issues:**
  - It's a long single page. The mission options change shape by type: Maths, Quiz, Fitness, Faith (with three sub-choices), None.
  - The completion mode is labelled "beta" and sits below the mission, though it changes how the alarm behaves.
  - Premium modes show a lock with no explanation in place.
- **Consolidation:** a stepped flow (journey B), or collapsible mission settings. Mission choice could be a visual picker instead of a 5-way segmented control.

### Alarm screen (`alarm/[occurrenceId]`)
- **Purpose:** the morning itself: alarm → mission → result.
- **Entry:** AlarmKit's "Stop & Open Terbit" / "Stop & Start Mission", the launch hand-off, a notification, or Simulate.
- **Key actions:** start the mission, Later (Gentle), skip / give up, then Done.
- **Issues:**
  - Result screens differ per mission: quiz review is a separate card; Faith combined shows two summaries.
  - The XP breakdown is a list of lines.
- **Consolidation:** one shared result layout (what you did, XP, streak, achievement) with a mission-specific detail slot.

### Missions
Each mission has its own view (`features/missions/*`, `features/faith/*`).
- **Maths:** questions with a retry after each wrong answer.
- **Quiz:** answer, see feedback and the explanation, then Next.
- **Fitness:**
  - Rep taps or a timer.
  - The activities shown come from the Mobility Profile catalogue (Settings → Accessibility): Standard, Reduced mobility, or Non-physical (breathing, number focus, hold and release, grounding).
  - The "get ready" countdown is 3 s, or 10 s with Extended pacing.
- **Faith:** Recitation pages; Reflection guided session; Recitation + Reflection in two steps.

**Issues:**
- Headers and progress indicators differ per mission (caption line, progress bar, counters).
- Abandoning is always the alarm screen's link below the mission, which is easy to miss.

### Practice (`alarms/practice`)
- **Purpose:** try any mission without an alarm or XP.
- **Entry:** Alarms "Wake-up missions" rows, the editor's "Try this mission", and the Faith hub (Reflection).
- **Issues:** development builds add a large developer section at the top of this user screen (mission switcher, Faith test panel, short sessions). It's useful, but it makes the development build feel different from the real app.

### Recent mornings (`alarms/history`)
- **Purpose:** per-morning outcome and details.
- **Issues:**
  - It sits under Alarms, but it's really progress history.
  - The details are long single lines.
- **Consolidation:** merge it into Progress as "History".

### Faith hub, Recitation day, Recitation archive (`alarms/faith/*`)
- **Purpose:** today's Daily Recitation (for visible traditions), Reflection, and the Recitation archive.
- **Issues:**
  - The hub lives under Alarms but is daily content.
  - Reflection opens Practice, which shows "Practice mode" wording for something that's a normal daily practice.
  - The tradition choice is a segmented control (it's a list with large text).
- **Consolidation:** Faith as a section of Today, or its own tab if engagement justifies it.

### Progress (`progress/index`)
- **Purpose:** morning streak, all-alarm stats, XP by discipline, ranks, achievements, recent XP.
- **Issues:**
  - It's a long list with no visual hierarchy.
  - "Sleep" placeholders are shown.
  - It doesn't link to the mornings behind the numbers (that's Recent mornings, under Alarms).
- **Consolidation:** a summary header, then tabs or sections for Streak, Disciplines, Achievements and History.

### Circles (`circles/index`)
Placeholder rows that don't do anything yet (Phase 5).

### Settings (rebuilt in Phase 3D)
The index groups are: Account; Alarms & missions (Faith); Notifications (Reminders); Accessibility; Privacy & data (Permissions, Your data); Developer (development builds only); About. Every row shows its current value or status.
- **Account:** guest/local, email sign-in, display name, backup status, sign out, delete account.
- **Faith:** primary faith (private), Explore other traditions, Recitation display.
- **Reminders:**
  - Shows that alarms always ring, as alarm-critical behaviour.
  - Follow-ups by mode: Gentle follow-ups are part of Gentle mode (no switch); Reward and Challenge send none. Shows the notification permission status.
  - Planned optional notifications are listed, not switchable.
- **Missions, motion & text:** Mobility Profile, mission pacing, and read-only "Follows iPhone setting" rows for Reduce Motion and text size, with the iPhone Settings path. These aren’t permissions, so there’s no button.
- **Permissions:**
  - Alarms and notifications, each with its status and "Allow" (only if never asked) or "Open iPhone Settings".
  - Audio needs no permission.
  - Microphone and camera are not used.
- **Your data:** what stays on the phone, the optional private backup, Faith privacy, no camera or microphone, and that export is planned.
- **Developer tools:** native alarm tests, plan/entitlements, progress diagnostics and seeding, sync diagnostics.

**Remaining issues:**
- "Alarms & missions" has only Faith. There are no alarm defaults yet, and every alarm sets its own mission and mode.
- Single-row groups make the index longer than its content.

## Core journeys

### A. Wake-up: alarm → mission → result → progress
1. AlarmKit rings. The user taps "Stop & Open Terbit" (Reward/Gentle) or "Stop & Start Mission" (Challenge).
2. Terbit opens the alarm screen for that morning (launch hand-off). In Challenge it goes straight into the mission.
3. Mission → "Morning complete" with what was done, XP, achievements and the morning/all-alarms note.
4. Done returns to the app. Progress is updated, but the user has to go to the Progress tab to see it.

**Friction:**
- Nothing on Today reflects the finished morning.
- The result screen layout differs per mission.
- The Gentle "Later" path depends on a reminder the user may have turned off. This is now explained on the screen.

### B. Create alarm: time → mode → mission → mission settings → save
**Actual order:** time → repeat → label → main wake-up → mission → mission settings → mode → sound → Save.

**Friction:**
- Mode comes after the mission, though it's the bigger decision.
- The page is long.
- Saving with a Gentle mode asks for notification permission straight away (contextual, but abrupt).
- If the alarm can't be scheduled, the "Fix permissions" alert is the only guidance. The Permissions screen now shows status too.

### C. Daily app check: Today → accountability status → upcoming alarms/missions → Progress
**Not supported yet.** Today is static. Status is spread across Alarms (list), Recent mornings (outcomes) and Progress (stats). This is the biggest consolidation opportunity.

### D. Faith: preference → Daily Recitation / Reflection → mission → archive
Settings → Faith (preference) → Alarms → Faith (today's Recitation, Reflection via Practice) → the alarm editor's Faith mission (Recitation / Reflection / Both) → Alarms → Faith → Recitation archive.

**Friction:**
- Faith content and settings are under different tabs.
- Reflection practice is labelled "Practice".
- The archive is two levels deep.

### E. Account: guest → optional sign-in → sync
Settings → Account & backup → email code → signed in, with backup status shown. Settings → Your data explains what is backed up.

**Friction:**
- There's no onboarding yet (Phase 6).
- Sign-in is only discoverable from Settings.
- Restore to a new phone isn't built (backup only).

## Duplication found (and what Phase 3D did)

| Duplication | Phase 3D |
|---|---|
| Developer panels spread over Alarms, Progress and Account | Moved to Settings → Developer tools (development builds only). Contextual tools stay where they act: "Simulate alarm" in the editor, the Faith test panel in Practice |
| Placeholder "coming soon" settings pages (Notifications, Privacy & Permissions, Accessibility) | Replaced by working screens |
| Faith: content (Alarms → Faith) and settings (Settings → Faith) | Kept separate: content vs settings. The naming could be clearer |
| Fitness accessibility: alarm-level `adaptation` field vs user need | One user-level Mobility Profile with its own catalogue per profile; the editor, Practice and alarm list show only that catalogue |
| A Gentle follow-up on/off setting duplicated the choice of mode | Removed: follow-ups are what Gentle mode is; choose Reward or Challenge instead |
| Recent mornings (Alarms) vs Progress | Not changed. Candidate to merge |

## Accessibility review (Phase 3D)

**Text size** was reviewed on the alarm editor, the mission screens, Recitation, Reflection, results, Progress and Settings:
- **Rows:** a value that sat beside the title now moves under it at large sizes, so long values like an email no longer squeeze the title.
- **Choices:** segmented choices with 3 or more options become a list at large sizes, so labels are no longer cut off.
- **Weekday buttons** grow instead of clipping.
- **Very large display numbers** (alarm clock, rep and timer counters, the maths question) are capped at 1.5× so they never overflow. All other text scales freely, including Recitation text and Reflection prompts.

**Motion:** the app has almost no animation. With iOS Reduce Motion on, screen transitions (including the alarm screen) fade instead of sliding. Progress bars aren't animated and stay visible.

**Still to review in the UX phase:**
- VoiceOver order on mission screens.
- Contrast of secondary text in dark mode.
- Haptic and visual alarm cues.
- Larger touch targets on the weekday picker.

## Deferred to the UX/UI phase
- A real Today screen (journey C).
- One shared result layout.
- A stepped alarm creation flow.
- Moving Faith content to where it's used daily.
- Merging History into Progress.
- Settings grouping once more settings exist (alarm defaults, sounds).
- Onboarding (Phase 6).
- A visual design system.
- Naming and category for non-physical activities. They sit under the "Fitness" mission and earn Fitness XP so accessibility isn't penalised. The UX phase should decide whether this becomes a neutral name (for example "Movement & focus" or "Wellbeing") or a separate discipline.
- Mobility Profile in first-run onboarding (the options are already defined once, in `MOBILITY_PROFILE_OPTIONS`).
