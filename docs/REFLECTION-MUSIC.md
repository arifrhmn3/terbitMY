# Reflection / Meditation music

The background music for the Reflection / Meditation mission. Designed on 12 Oct 2026 and **built in Phase 3C**, using development placeholder tracks only. Content rules for Faith missions are in [FAITH-CONTENT.md](FAITH-CONTENT.md).

## Product requirement

- Every Reflection / Meditation session plays a deep-relaxation background track.
- There is **one canonical daily track**. Everyone on the same calendar day gets the same track, and it changes every day so each day's session feels distinct.
- The track is **universal**, not tied to any religion. Recitation stays faith-specific.
- The music plays continuously under all guided prompts and never restarts between them.
- A daily session has a daily theme, guided prompts, today's track, a session duration, and earns **Faith XP** when completed.
- **The mission must never depend on live internet.**

## Architecture

```
calendar date ─► Daily Reflection (theme, prompt set, track ID) ─► ReflectionMusicProvider ─► playable source ─► player
2026-10-12        gratitude · gratitude-1 · reflection-001          resolves + caches          file:///…/reflection-001.wav
```

Terbit owns the schedule (date → track ID). The provider only turns a track ID into something playable, so it can be replaced later without changing the schedule, the mission screen or the session logic. A provider's "random track" endpoint is never used.

| Piece | File |
|---|---|
| Daily schedule (theme, prompts, track) | `src/features/faith/reflection/schedule.ts` (layered history, see below) |
| Provider + resolution order | `src/features/faith/reflection/music/provider.ts` |
| Catalogue + licence metadata | `src/features/faith/reflection/music/catalogue.ts`, `music/types.ts` |
| Remote location | `music/config.ts`: default `<Supabase URL>/storage/v1/object/public/reflection-music`, or `EXPO_PUBLIC_REFLECTION_MUSIC_BASE_URL` |
| Saved files | `src/services/file-cache` (the app's cache folder; download to a temporary name, then rename) |
| Player | `src/services/audio/meditation-player.ts` (`expo-audio`) |
| Session screen | `src/features/faith/reflection/reflection-mission-view.tsx` |

### Daily schedule

- The **calendar date** is the phone's local date, the same one the Progress Engine uses. "Same day, same track" holds within a time zone; users elsewhere get the track for their own date.
- A published schedule is data: explicit `date → value` entries plus rotation segments over frozen lists. It's deterministic, so every phone agrees offline.
- **Newer schedules are added as layers that only apply after tomorrow.** A past day's track, and today's and tomorrow's, can never change, even when a newer schedule is bundled or downloaded later. Adding tracks to the catalogue never changes history.

### Resolution order (`ReflectionMusicProvider.resolve`)

1. The track is **bundled** (and its licence allows bundling) or **already cached**: play it from the phone.
2. Network allowed, and the licence permits caching: **download, cache, play** (with a timeout).
3. Network allowed, archive only, and the licence permits streaming: **stream** it.
4. Otherwise: the **bundled fallback** track (recorded as `musicSource: 'fallback'`).

**Alarm missions resolve with no network at all.** They play today's track if it's on the phone, else the fallback, so they never wait. The licence flags on each track decide steps 2 and 3, so a future provider that forbids caching streams automatically, with no UI change.

### Today and later sessions

There's **no Reflection archive**: past days' sessions are never listed or browsable. Reflection can be used several times a day:
- The first session of the day plays today's track.
- A later session that day is a fresh session drawn from earlier days' Reflections, usually with a different track. See [FAITH-CONTENT.md](FAITH-CONTENT.md#several-reflection-sessions-in-one-day).

| | Today's track | A later session's track |
|---|---|---|
| Fetching | Prefetched ahead of time (today and tomorrow): at start-up, when the app comes to the front, and when alarms or Faith settings change | Already on the phone if it was prefetched on an earlier day, otherwise fetched when played (practice only) |
| No internet | Cached copy, else the bundled fallback. The session always runs | Cached copy, else the bundled fallback |
| After fetching | Cached, if the licence permits | Cached, if the licence permits |

The provider still supports an `archive` purpose (it streams when caching isn't permitted), but no screen uses it now.

Cached files live in the app's cache folder; if iOS clears them, nothing breaks. With only three small placeholder tracks the cache isn't pruned yet. Add pruning (keep today, tomorrow and recent days) together with the production catalogue.

### Playback on iOS (`expo-audio`)

- **Plays even when the silent switch is on** (`playsInSilentMode: true`). The user deliberately started an audio-guided session.
- **Takes audio focus** (`interruptionMode: 'doNotMix'`). Spotify, Apple Music and other audio pause instead of mixing. When the session ends, Terbit releases audio (`setIsAudioActiveAsync(false)`) so other apps can carry on.
- **One player per session**, owned by the session screen, looping. Prompt changes never touch it. It fades in at the start and fades out at the end.
- **No background audio** (`shouldPlayInBackground: false`; the config plugin has `enableBackgroundPlayback: false`). Leaving the app pauses both the session and the music; the user taps Resume.
- **No microphone:** the config plugin sets `microphonePermission: false` and `recordAudioAndroid: false`.
- This needed a native package (`expo-audio`, plus `expo-file-system` and `expo-asset`), so **a new iOS development build is required**. No Android work was done; Android follows in Phase 7.

### Track metadata (licensing)

Each track (`ReflectionTrack`) stores:
- its internal Terbit ID, title and duration;
- its provider/source and external asset ID;
- **licence:** type, reference URL, whether attribution is required (and the attribution text), commercial app use, local caching, offline bundling, streaming, date acquired, and notes;
- approval: `dev_placeholder` or `production_approved`;
- provenance notes.

The normal UI shows only the title (with "(development placeholder)" while placeholders are in use). Licensing details are never shown to users.

## Development placeholders (in use now)

| ID | Title | Where | Length |
|---|---|---|---|
| `reflection-fallback` | Soft Horizon | Bundled in the app (`assets/audio/reflection-fallback.wav`) | 32 s loop |
| `reflection-001` | Still Water | Supabase Storage bucket `reflection-music` | 48 s loop |
| `reflection-002` | Morning Mist | same | 48 s loop |
| `reflection-003` | Quiet Field | same | 48 s loop |

All four were **generated by Terbit** with `scripts/generate-placeholder-music.mjs`: soft synthesised sine pads, no samples and no third-party music. Every one is marked `approval: 'dev_placeholder'`, `licence.type: 'dev-placeholder'` and `commercialAppUse: false`. **They're never production-approved.** `unapprovedTracks()` (tested) lists every track not marked `production_approved`, and it must return nothing before beta.

### One-time setup: upload the placeholder tracks

Without this step, sessions still work but always play the bundled fallback.

1. In Supabase, open the **SQL Editor**. Run `supabase/migrations/20261012120000_faith_preference_and_reflection_music.sql`. It creates the public, read-only `reflection-music` bucket, and adds the private `faith_preference` profile column.
2. Go to **Storage → reflection-music → Upload files**. Upload the three files from `supabase/storage/reflection-music/` (`reflection-001.wav`, `reflection-002.wav`, `reflection-003.wav`).

## Licensing rules

- Don't scrape, download or redistribute music from Spotify, Apple Music, YouTube or any consumer streaming service.
- Don't assume online "royalty-free" music may be redistributed or cached inside a commercial app. Every track needs a licence covering Terbit MY's actual usage.

## Long-term direction (deferred to beta / polish)

The current preferred direction:
- generate original instrumental relaxation tracks with an AI music generator whose terms grant appropriate commercial rights;
- keep the catalogue metadata (the source of truth) in GitHub;
- host the production audio in object storage or a CDN, possibly Supabase Storage;
- keep generation, licensing and provenance records for every track.

Nothing about this is built yet. The provider and catalogue structure already support it.

## Beta requirement: Production Reflection Music Catalogue and Licensing Approval

Before public beta or any public distribution, choose one of these:

- **A.** A stock-music provider whose licence explicitly permits commercial mobile-app use, playback, and the intended caching and download behaviour.
- **B.** A custom or commercial licence from a music provider for Terbit MY.
- **C.** Original music commissioned for Terbit MY, with written commercial rights covering worldwide mobile-app use, streaming and playback, local caching, redistribution as part of the app experience, and use after the commissioning agreement ends.
- **D.** Original music owned by Terbit. This includes AI-generated tracks only where the generator's terms give Terbit those rights; record this in each track's provenance.

Every production track needs a confirmed licence recorded in its metadata, with `approval: 'production_approved'`. The development placeholders must be replaced or removed.
