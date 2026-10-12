# Faith missions: content, integrity and review

Phase 3C. This page covers the Recitation and Reflection / Meditation missions, how religious content is handled, and what must be done before beta. Music has its own page: [REFLECTION-MUSIC.md](REFLECTION-MUSIC.md).

## Faith preference (private)

- Choices: Islam, Christianity, Buddhism, Hinduism, Non-religious / Guided Reflection, Prefer not to say. It can be left unset, which behaves like "Prefer not to say".
- It's set in **Settings → Faith**, and works for guests: no account is needed. Onboarding will also ask for it later (Phase 6).
- It's stored on the phone (`app_settings`, key `faith.settings`). If the user signs in, it's backed up to their **private** profile (`profiles.faith_preference`, owner-only RLS).
- **Private.** It's never shown in Circles, to friends, on public profiles, in social features, or sent to analytics. `features/faith/privacy.ts` allow-lists the only profile fields that may ever be shared, and faith isn't one of them. Tests check this, and also check that the SQL has no public view or anonymous grant.
- **Explore other faith traditions** (default OFF) is a separate setting. When it's on, the user can browse other traditions' Recitations. Browsing never changes their primary preference.

| Primary preference | Faith missions shown (default first) |
|---|---|
| Islam / Christianity / Buddhism / Hinduism | Recitation (own tradition), Reflection, Recitation + Reflection |
| Non-religious, Prefer not to say, not chosen | Reflection only (the other two appear if Explore is on) |

## Faith missions

Recitation and Reflection / Meditation are **separate, parallel experiences**. An alarm can use either one, or both in sequence. Each earns **Faith XP** (10 XP) through the existing progression engine: once per occurrence, counting toward Faith Rank and Total XP, with the existing difficulty and Challenge bonuses and Main Wake-Up rules. Any of them unlocks the **First Faith mission** achievement.

- **Recitation:** `{ type: 'recitation', tradition }`. The passage itself comes from the daily schedule. Completion is self-reported: Begin, read page by page with a progress bar, then confirm "I've finished". There's no microphone. A verified mode could later add a check before confirmation without changing the flow.
- **Reflection / Meditation:** `{ type: 'reflection', difficulty }`, where difficulty sets the length: Easy 45 s, Medium 2 min, Hard 4 min. All values are set in `features/faith/policy.ts`. The session runs: settle in, prompts spread through the session, closing intention. It uses the daily theme and the daily track, and the music plays continuously underneath.
- **Recitation + Reflection:** `{ type: 'recitation_reflection', tradition, difficulty }`. Today's Recitation, then a Reflection of the chosen length. It's **one alarm occurrence with one reward**. Leaving during either stage completes nothing, and an occurrence only accepts the result of its own mission type, so a Recitation alone can't complete it.
- A Recitation-only alarm ends when the Recitation is finished. Neither the Recitation screens nor the daily Recitation page show or suggest a Reflection.

### Several Reflection sessions in one day

Reflection / Meditation can be used more than once a day, in practice or on alarms.
- The **first session** of the day is today's canonical Reflection (theme, prompts, track).
- **A later session** is a fresh session for today, drawn from Reflections scheduled on the previous 28 days (`reflection/sessions.ts`). It prefers prompt sets not used today (otherwise the least recently used), then a track different from the last session, then the nearest earlier day, so the same session never plays twice in a row.
- A session counts once **Start** is tapped. Opening the screen and leaving doesn't count.
- The record (`faith.reflectionSessions`) holds only today's sessions, stays on the phone, and is never shown as history.

## Daily schedules (Terbit decides; never random)

```
tradition + date ─► Terbit Daily Recitation (daily-islam-2026-10-12) ─► provider + content ID ─► text
date ─► Daily Reflection (theme, prompt set, track ID)
```

- **The date** is the phone's local calendar date, the same one the Progress system uses.
- **Same answer everywhere:** everyone of a tradition gets the same passage on the same date, and every phone computes it offline, with no server call.
- **Schedule format:** a published schedule has explicit entries plus rotation segments.
- **History is layered.** A newer schedule (from a new app version, or downloaded from Supabase later) is added as a layer that only applies **after tomorrow**. Past dates, today and tomorrow can never change. Tests cover this.
- **Publishing rules:** never change a past date; change a rotation only by adding a new segment that starts on a later date; publish at least two days ahead.
- **Pinned content:** a schedule points at a provider's stable content ID, so changing provider later never changes what a past date showed.
- **Future dates** can't be opened.

## Source integrity (non-negotiable)

Terbit may **choose** which passage, which verse range, and which approved translation or transliteration to show. Terbit must **never**:
- paraphrase, simplify or reword scripture;
- shorten verses;
- merge scripture with summaries;
- generate scripture with AI;
- silently "correct" a source.

How the code enforces this:

- **`FaithContentProvider`** (`recitation/content.ts`) returns text exactly as the trusted source gives it. Screens never call a source directly.
- **The cache** (`faith_content_cache`, migration 9) stores the JSON exactly, with a checksum. If stored text no longer matches its checksum, it's never shown.
- **Screens** render each text field as stored: no trimming, re-wording or re-casing.
- **Length:** a passage that's too long is never shortened. A different passage is chosen instead (`duration.ts`: target 12–20 min, acceptable 10–30, hard ceiling 30).
- **Tests** run text with odd spacing, punctuation and combining marks through the cache and library and check it comes back unchanged.

## Offline first

- **Alarm missions never wait on the network.**
  - Recitation opens today's passage from the phone. If it isn't there, it uses an approved local **fallback passage** for that tradition, so the user can always finish the alarm.
  - Reflection plays today's track if it's on the phone, else the bundled fallback track.
- **Prefetch** (`use-faith.ts`) saves today's and tomorrow's passages and tracks. It runs:
  - at start-up;
  - when the app comes to the front;
  - when alarms or Faith settings change.
- **The Recitation archive** (Alarms → Faith → Recitation archive) lists the last 30 days' Daily Recitations for the chosen tradition.
  - Each date opens the exact canonical passage assigned to that tradition and date.
  - A day not on the phone needs internet; once opened, it's saved.
  - **Recitation only:** Reflection / Meditation sessions are never archived or listed.

## Development content (Phase 3C)

There's no real religious text in the app yet. The fixtures (`recitation/content.ts`) are clearly labelled **placeholder text in each script, not scripture**. They're marked `devFixture: true` and `review: 'draft'`, and the screens say "Development sample: placeholder text, not scripture". This avoids inventing or misquoting any religious text.

- **`dev-bundled`** ships in the app and provides the offline fallback passages.
- **`dev-remote`** stands in for a remote source. It only answers when "online", so caching, offline, fallback and archive behaviour can be tested now.

## Review states

Content goes through `draft` → `source_verified` (matches the trusted source word for word) → `reviewed` (checked by a qualified reviewer for that tradition) → `approved`.

## Beta requirement: Faith Content Sources and Review Approval

Before public beta or any public distribution:

1. **Choose a trusted source for each tradition**, with licences that cover Terbit MY's use: display, caching, offline fallback, and any audio. Examples: a trusted Quran source such as Quran Foundation or UmmahAPI; a trusted Bible API with licensed translations; trusted Buddhist and Hindu scripture sources. Then implement each as a `FaithContentProvider`.
2. **Choose qualified reviewers** for each tradition. They should approve the passage selection, the translations and transliterations, and the bundled offline fallback passages.
3. **Publish real daily schedules** that follow the rules above, with passages that are 10–30 minutes long.
4. **Ship only `approved` content.** Remove every development fixture, and add a release check that refuses anything not approved.

Final content-review responsibility remains with Terbit and the chosen reviewers. It's a beta/release requirement, not a development one.
