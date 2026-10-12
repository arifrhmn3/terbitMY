# Reflection / Meditation music

Design for the background music used by the Reflection / Meditation mission (Phase 3C). Recorded 12 Oct 2026, before Phase 3C starts. Nothing here is built yet.

## Product requirement

- Every Reflection / Meditation session plays a deep-relaxation background track.
- There is **one canonical daily track**. All users on the same calendar day get the same track, and it changes every day so each day's session feels distinct.
- The track is **universal** and not tied to religion. Recitation stays faith-specific.
- Music plays continuously under all guided prompts. It never restarts between prompts.
- A daily session has a daily theme, guided prompts, today's track, a session duration, and earns **Faith XP** when completed.
- **The mission must never depend on live internet.**

## Architecture

```
calendar date ─► Terbit daily track ID ─► ReflectionMusicProvider ─► local asset (cached or bundled) ─► player
2026-10-12        reflection-track-004      resolves + caches           file:///…/reflection-track-004.m4a
```

Terbit owns the schedule (date → track ID). The provider only turns a track ID into something playable. The provider can be replaced later without changing the schedule, the mission screen, or the session logic. Provider "random track" endpoints are never used.

### Daily schedule

- The **calendar date** is the phone's local date, the same `dayKey` the Progress Engine uses. So "same day, same track" holds within a time zone, and users in other time zones get the track for their own date.
- The schedule is **published data, not a formula**: a versioned list of `date → trackId` entries, bundled with the app and later updatable from Supabase. Adding tracks to the catalogue never changes a past day's track.
- For dates past the end of the published schedule, a fixed fallback rotation applies (days since an anchor date, modulo a **frozen** list of track IDs for that schedule version). It's deterministic, so every phone agrees offline.
- Planned location: `src/features/missions/reflection/music/schedule.ts`. It's pure and unit-tested.

### `ReflectionMusicProvider`

```ts
type ReflectionMusicProvider = {
  /** Track metadata (title, duration, licence flags). Never shown in full to users. */
  metadata(trackId: TrackId): Promise<ReflectionTrack | null>;
  /** Best playable URI right now. Never throws, and never waits on the network
   *  longer than a short timeout: it falls back instead. */
  resolve(trackId: TrackId, opts: { online: boolean }): Promise<ResolvedTrack>;
  /** Download + cache, only if the track's licence allows local caching. */
  prefetch(trackId: TrackId): Promise<'cached' | 'not_permitted' | 'failed'>;
  isAvailableOffline(trackId: TrackId): Promise<boolean>;
};

type ResolvedTrack = {
  uri: string;
  trackId: TrackId;            // the track actually played (may be the fallback)
  source: 'bundled' | 'cache' | 'stream' | 'fallback';
  requestedTrackId: TrackId;
};
```

Resolution order:

1. The requested track is **bundled** or **already cached**: play it.
2. **Online**, and the licence allows caching: download, cache, play.
3. **Online**, and the licence allows streaming but not caching: stream it. This is for archive days only, never today.
4. Otherwise: the **bundled fallback** track. The session records `source: 'fallback'`.

The licence flags on each track decide steps 2 and 3. A future provider that forbids caching therefore streams automatically, with no UI change.

### Today vs archive

| | Today | Previous days (archive) |
|---|---|---|
| Fetching | Prefetched ahead of time (app open, alarm saved, the night before) when caching is permitted | Fetched on demand |
| No internet | Cached copy, else the bundled fallback. The session always runs | Cached copy if any, else a "needs internet" note with an offer to use the fallback |
| Caching after fetch | If permitted | Only if permitted. Streaming otherwise |

The cache is bounded (for example, today, tomorrow and a few recent days) and pruned. Cached files live in the app's cache directory, and losing them is harmless.

### Playback

- **One player is owned by the session**, not by the prompt components, so moving between prompts never restarts the music.
- The track loops if it's shorter than the session, with a gentle fade-in and fade-out.
- The audio API is chosen at build time from the Expo SDK 57 docs (likely `expo-audio`; verify before use). Open decisions: whether music plays when the silent switch is on, and whether it mixes with other audio.
- No background audio. The session pauses with the app, like the fitness timer.

### Track metadata (licensing)

```ts
type ReflectionTrack = {
  id: TrackId;                     // internal Terbit ID, e.g. 'reflection-track-004'
  title: string;
  durationSec: number;
  provider: string;                // 'terbit-bundled' | 'terbit-storage' | future provider
  externalAssetId: string | null;
  licence: {
    type: string;                  // e.g. 'dev-placeholder', 'stock-commercial', 'commissioned', 'terbit-owned'
    referenceUrl: string | null;
    attributionRequired: boolean;
    attributionText: string | null;
    commercialAppUse: boolean;
    localCachingPermitted: boolean;
    offlineBundlingPermitted: boolean;
    streamingPermitted: boolean;
    acquiredOn: string | null;     // YYYY-MM-DD
    notes: string;
  };
  approval: 'dev_placeholder' | 'production_approved';
};
```

The normal UI shows only the title, plus attribution where a licence requires it. Full licensing details appear only in developer diagnostics.

## Development placeholders

Keep this as small as possible, just enough to prove daily selection, continuous playback, caching, fallback and archive behaviour:

- **1 bundled fallback track** (short seamless loop).
- **2–3 "remote" tracks** in a Terbit-controlled location (planned: a Supabase Storage bucket on the existing project), used to test download, cache, offline and archive behaviour.

To keep the rights unambiguous, placeholders will be **generated by us** (a simple synthesised ambient pad or soft noise), not taken from the internet. Every placeholder is marked `approval: 'dev_placeholder'` and `licence.type: 'dev-placeholder'`.

**Placeholders are never production-approved.** A catalogue check (unit test and release gate) lists every track not marked `production_approved`. Before beta it must find none.

## Licensing rules

- Don't scrape, download or redistribute music from Spotify, Apple Music, YouTube or any consumer streaming service.
- Don't assume online "royalty-free" music may be redistributed or cached inside a commercial app. Every track needs a licence that covers Terbit MY's actual usage model.

## Beta requirement: Production Reflection Music Catalogue and Licensing Approval

Before public beta or any public distribution, choose one of these:

- **A.** A stock-music provider whose licence explicitly permits commercial mobile-app use, playback, and the intended caching and download behaviour.
- **B.** A custom or commercial licence from a music provider for Terbit MY.
- **C.** Original music commissioned for Terbit MY, with written commercial rights covering worldwide mobile-app use, streaming and playback, local caching, redistribution as part of the app experience, and use after the commissioning agreement ends.
- **D.** Original music owned by Terbit.

Every production track must have a confirmed licence recorded in its metadata, with `approval: 'production_approved'`. The development placeholders must be replaced or removed.
