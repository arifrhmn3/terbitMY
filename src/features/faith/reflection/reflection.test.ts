import { describe, expect, it } from '@jest/globals';

import { MISSION_DIFFICULTIES } from '@/features/missions/types';

import { FAITH_POLICY } from '../policy';
import { addDays } from '../schedule';
import { FALLBACK_TRACK_ID, PLACEHOLDER_CATALOGUE, unapprovedTracks } from './music/catalogue';
import { musicBaseUrl } from './music/config';
import { createReflectionMusicProvider, type TrackFileStore } from './music/provider';
import type { ReflectionTrack } from './music/types';
import { findPromptSet, PROMPT_SETS } from './prompts';
import { dailyReflection, initialReflectionSchedule } from './schedule';
import {
  createReflectionSession,
  currentStepIndex,
  pauseReflection,
  reflectionElapsedMs,
  reflectionPhase,
  reflectionResult,
  resumeReflection,
  startReflection,
  tickReflection,
} from './session';
import { REFLECTION_THEMES } from './types';

describe('Daily Reflection schedule', () => {
  const schedule = initialReflectionSchedule();

  it('every user gets the same theme, prompts and track on the same date', () => {
    expect(dailyReflection(schedule, '2026-10-20')).toEqual(dailyReflection(initialReflectionSchedule(), '2026-10-20'));
    expect(dailyReflection(schedule, '2026-10-12')).toMatchObject({ theme: 'gratitude', trackId: 'reflection-001' });
  });

  it('changes day to day: the theme and the track vary across a week', () => {
    const week = Array.from({ length: 7 }, (_, i) => dailyReflection(schedule, addDays('2026-10-13', i)));
    expect(new Set(week.map((d) => d.theme)).size).toBeGreaterThan(4);
    expect(new Set(week.map((d) => d.trackId)).size).toBe(3);
  });

  it('every scheduled prompt set and track exists, and every theme has prompts', () => {
    for (let i = 0; i < 16; i++) {
      const d = dailyReflection(schedule, addDays('2026-10-01', i));
      expect(findPromptSet(d.promptSetId)?.theme).toBe(d.theme);
      expect(PLACEHOLDER_CATALOGUE.some((t) => t.id === d.trackId)).toBe(true);
    }
    for (const theme of REFLECTION_THEMES) expect(PROMPT_SETS.some((p) => p.theme === theme)).toBe(true);
  });
});

describe('guided Reflection session', () => {
  const prompts = findPromptSet('calm-1')!;

  it('durations come from the central policy and sit inside each range', () => {
    for (const d of MISSION_DIFFICULTIES) {
      const { min, max } = FAITH_POLICY.reflection.rangeSec[d];
      expect(FAITH_POLICY.reflection.durationSec[d]).toBeGreaterThanOrEqual(min);
      expect(FAITH_POLICY.reflection.durationSec[d]).toBeLessThanOrEqual(max);
      expect(createReflectionSession(prompts, d).targetMs).toBe(FAITH_POLICY.reflection.durationSec[d] * 1000);
    }
  });

  it('settle → prompts through the session → closing intention; longer sessions show more prompts', () => {
    const hard = createReflectionSession(prompts, 'hard');
    expect(hard.steps.map((s) => s.kind)).toEqual(['settle', 'prompt', 'prompt', 'prompt', 'closing']);
    expect(createReflectionSession(prompts, 'easy').steps.map((s) => s.kind)).toEqual(['settle', 'prompt', 'closing']);
    const starts = hard.steps.map((s) => s.startsAtMs);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);

    let s = startReflection(hard, 0);
    const seen = new Set<number>();
    for (let t = 0; t < hard.targetMs; t += 1000) seen.add(currentStepIndex(s, t));
    expect([...seen]).toEqual([0, 1, 2, 3, 4]);
    s = tickReflection(s, hard.targetMs);
    expect(reflectionPhase(s)).toBe('done');
  });

  it('time comes from timestamps: pauses are excluded and completion is exact even if checked late', () => {
    let s = startReflection(createReflectionSession(prompts, 'easy'), 1_000);
    s = pauseReflection(s, 11_000);
    expect(tickReflection(s, 500_000)).toBe(s); // paused: never completes
    s = resumeReflection(s, 31_000); // 20 s paused
    expect(reflectionElapsedMs(s, 41_000)).toBe(20_000);
    s = tickReflection(s, 999_000);
    expect(s.completedAt).toBe(1_000 + 20_000 + 45_000);
    const result = reflectionResult(s, dailyReflection(initialReflectionSchedule(), '2026-10-12'), prompts, 'easy', null);
    expect(result).toMatchObject({ type: 'reflection', theme: 'calm', targetMs: 45_000, durationMs: 45_000, date: '2026-10-12' });
  });
});

function files(initial: string[] = []) {
  const saved = new Set(initial);
  const store: TrackFileStore & { downloads: number; fail: boolean; slow: boolean } = {
    downloads: 0,
    fail: false,
    slow: false,
    async cachedUri(track) {
      return saved.has(track.id) ? `file:///cache/${track.externalAssetId}` : null;
    },
    async download(track) {
      store.downloads += 1;
      if (store.slow) await new Promise((r) => setTimeout(r, 200));
      if (store.fail) throw new Error('offline');
      saved.add(track.id);
      return `file:///cache/${track.externalAssetId}`;
    },
  };
  return store;
}

const BUNDLED = 7; // a require() module number

function provider(store: TrackFileStore, opts: { catalogue?: ReflectionTrack[]; baseUrl?: string | null; forceFallback?: boolean } = {}) {
  return createReflectionMusicProvider({
    catalogue: opts.catalogue ?? PLACEHOLDER_CATALOGUE,
    fallbackTrackId: FALLBACK_TRACK_ID,
    bundled: { [FALLBACK_TRACK_ID]: BUNDLED },
    files: store,
    remoteUrl: (t) => (opts.baseUrl === null ? null : `${opts.baseUrl ?? 'https://x.test/m'}/${t.externalAssetId}`),
    timeoutMs: 50,
    forceFallback: () => opts.forceFallback ?? false,
  });
}

describe('ReflectionMusicProvider: resolution order', () => {
  it('1. a cached daily track plays from the phone (no network)', async () => {
    const store = files(['reflection-001']);
    const r = await provider(store).resolve('reflection-001', { network: false, purpose: 'today' });
    expect(r).toMatchObject({ kind: 'cache', source: { uri: 'file:///cache/reflection-001.wav' }, track: { id: 'reflection-001' } });
    expect(store.downloads).toBe(0);
  });

  it('alarm missions (no network): a track not on the phone falls back to the bundled track, without waiting', async () => {
    const store = files();
    const r = await provider(store).resolve('reflection-002', { network: false, purpose: 'today' });
    expect(r).toMatchObject({ kind: 'fallback', source: BUNDLED, requestedTrackId: 'reflection-002', track: { id: FALLBACK_TRACK_ID } });
    expect(store.downloads).toBe(0);
  });

  it('2. with network and a licence that permits caching: download, cache, play', async () => {
    const store = files();
    const p = provider(store);
    expect(await p.resolve('reflection-003', { network: true, purpose: 'today' })).toMatchObject({ kind: 'download' });
    expect(await p.isAvailableOffline('reflection-003')).toBe(true);
  });

  it('3. archive: streams when the licence permits streaming but not caching; today never streams', async () => {
    const noCache = PLACEHOLDER_CATALOGUE.map((t) => ({ ...t, licence: { ...t.licence, localCachingPermitted: false } }));
    const store = files();
    const p = provider(store, { catalogue: noCache });
    expect(await p.resolve('reflection-001', { network: true, purpose: 'archive' })).toMatchObject({
      kind: 'stream',
      source: { uri: 'https://x.test/m/reflection-001.wav' },
    });
    expect(store.downloads).toBe(0);
    expect(await p.resolve('reflection-001', { network: true, purpose: 'today' })).toMatchObject({ kind: 'fallback' });
    expect(await p.prefetch('reflection-001')).toBe('not_permitted');
  });

  it('4. a failed or slow download never blocks: archive streams, otherwise the fallback plays', async () => {
    const store = files();
    store.fail = true;
    expect(await provider(store).resolve('reflection-001', { network: true, purpose: 'today' })).toMatchObject({ kind: 'fallback' });
    const slow = files();
    slow.slow = true;
    const started = Date.now();
    expect(await provider(slow).resolve('reflection-001', { network: true, purpose: 'archive' })).toMatchObject({ kind: 'stream' });
    expect(Date.now() - started).toBeLessThan(180);
  });

  it('no remote source configured, unknown track, or the developer switch: bundled fallback', async () => {
    expect(await provider(files(), { baseUrl: null }).resolve('reflection-001', { network: true, purpose: 'archive' })).toMatchObject({ kind: 'fallback' });
    expect(await provider(files()).resolve('nope', { network: true, purpose: 'today' })).toMatchObject({ kind: 'fallback' });
    expect(await provider(files(['reflection-001']), { forceFallback: true }).resolve('reflection-001', { network: false, purpose: 'today' })).toMatchObject({
      kind: 'fallback',
    });
  });

  it('prefetch caches ahead of time; the bundled fallback is always available offline', async () => {
    const store = files();
    const p = provider(store);
    expect(await p.prefetch('reflection-002')).toBe('cached');
    expect(await p.prefetch('reflection-002')).toBe('already_available');
    expect(await p.isAvailableOffline(FALLBACK_TRACK_ID)).toBe(true);
    store.fail = true;
    expect(await p.prefetch('reflection-003')).toBe('failed');
  });
});

describe('music catalogue and licensing', () => {
  it('every track has full licence metadata', () => {
    for (const t of PLACEHOLDER_CATALOGUE) {
      expect(Object.keys(t.licence).sort()).toEqual(
        [
          'acquiredOn',
          'attributionRequired',
          'attributionText',
          'commercialAppUse',
          'localCachingPermitted',
          'notes',
          'offlineBundlingPermitted',
          'referenceUrl',
          'streamingPermitted',
          'type',
        ].sort(),
      );
    }
  });

  it('development placeholders are never production-approved (the release gate lists them all)', () => {
    expect(PLACEHOLDER_CATALOGUE.every((t) => t.approval === 'dev_placeholder' && t.licence.type === 'dev-placeholder')).toBe(true);
    expect(PLACEHOLDER_CATALOGUE.every((t) => t.licence.commercialAppUse === false)).toBe(true);
    expect(unapprovedTracks(PLACEHOLDER_CATALOGUE)).toHaveLength(PLACEHOLDER_CATALOGUE.length);
  });

  it('remote tracks come from a Terbit-controlled bucket by default', () => {
    expect(musicBaseUrl({ supabaseUrl: 'https://abc.supabase.co/' })).toBe('https://abc.supabase.co/storage/v1/object/public/reflection-music');
    expect(musicBaseUrl({ musicBaseUrl: 'https://cdn.example.com/m/', supabaseUrl: 'https://abc.supabase.co' })).toBe('https://cdn.example.com/m');
    expect(musicBaseUrl({})).toBeNull();
  });
});
