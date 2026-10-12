import { describe, expect, it } from '@jest/globals';

import { describeMission } from '@/features/alarms/alarm';
import { parseMission } from '@/features/alarms/alarm-repository';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { faithDev } from './faith-dev';
import { createFaithServices, FAITH_SCHEDULES_KEY } from './faith-services';
import { createMemoryRecitationCache } from './recitation/cache';
import { FALLBACK_TRACK_ID } from './reflection/music/catalogue';

const noon = (day: number) => new Date(2026, 9, day, 12).getTime();

function setup(day = 12) {
  const settings = createMemorySettingsStore();
  const saved = new Set<string>();
  const clock = { now: noon(day) };
  const services = () =>
    createFaithServices({
      settings,
      recitationCache: createMemoryRecitationCache(),
      trackFiles: {
        cachedUri: async (t) => (saved.has(t.id) ? `file:///${t.externalAssetId}` : null),
        download: async (t) => {
          saved.add(t.id);
          return `file:///${t.externalAssetId}`;
        },
      },
      bundledTracks: { [FALLBACK_TRACK_ID]: 1 },
      musicBaseUrl: 'https://x.test/m',
      now: () => clock.now,
    });
  return { settings, saved, clock, services };
}

describe('Faith services', () => {
  it('today follows the local calendar date, and a developer test date overrides it', () => {
    const ctx = setup();
    const faith = ctx.services();
    expect(faith.today()).toBe('2026-10-12');
    faithDev.set({ date: '2026-10-20' });
    expect(faith.today()).toBe('2026-10-20');
    faithDev.set({ date: null });
  });

  it('saves the schedule history on the phone the first time', async () => {
    const ctx = setup();
    await ctx.services().schedules();
    expect(await ctx.settings.get(FAITH_SCHEDULES_KEY)).not.toBeNull();
  });

  it('prepares today’s and tomorrow’s Recitation and Reflection music so missions work offline', async () => {
    const ctx = setup();
    const faith = ctx.services();
    await faith.prepareAhead(['islam']);
    expect(await faith.recitation.isOnPhone('islam', '2026-10-12')).toBe(true);
    expect(await faith.recitation.isOnPhone('islam', '2026-10-13')).toBe(true);
    expect(await faith.recitation.isOnPhone('christianity', '2026-10-12')).toBe(false);
    const today = await faith.reflectionFor('2026-10-12');
    const tomorrow = await faith.reflectionFor('2026-10-13');
    expect(ctx.saved.has(today.trackId) && ctx.saved.has(tomorrow.trackId)).toBe(true);

    faithDev.set({ forceOffline: true });
    expect((await faith.recitation.forMission('islam')).usedFallback).toBe(false);
    expect(await faith.music.resolve(today.trackId, { network: false, purpose: 'today' })).toMatchObject({ kind: 'cache' });
    faithDev.set({ forceOffline: false });
  });

  it('developer switches: forced offline blocks fetching; forced fallback music plays the bundled track', async () => {
    const ctx = setup();
    const faith = ctx.services();
    faithDev.set({ forceOffline: true });
    await faith.prepareAhead(['islam']);
    expect(await faith.recitation.isOnPhone('islam', '2026-10-12')).toBe(false);
    expect((await faith.recitation.forMission('islam')).usedFallback).toBe(true);
    faithDev.set({ forceOffline: false, forceFallbackMusic: true });
    const today = await faith.reflectionFor('2026-10-12');
    expect(await faith.music.resolve(today.trackId, { network: true, purpose: 'today' })).toMatchObject({ kind: 'fallback' });
    faithDev.set({ forceFallbackMusic: false });
  });
});

describe('Faith missions on alarms', () => {
  it('are stored and read back like other missions; anything invalid falls back safely', () => {
    expect(parseMission(JSON.stringify({ type: 'recitation', tradition: 'islam' }))).toEqual({ type: 'recitation', tradition: 'islam' });
    expect(parseMission(JSON.stringify({ type: 'reflection', difficulty: 'hard' }))).toEqual({ type: 'reflection', difficulty: 'hard' });
    expect(parseMission(JSON.stringify({ type: 'recitation', tradition: 'other' })).type).toBe('math');
    expect(parseMission(JSON.stringify({ type: 'reflection', difficulty: 'extreme' })).type).toBe('math');
    const both = { type: 'recitation_reflection', tradition: 'hinduism', difficulty: 'medium' } as const;
    expect(parseMission(JSON.stringify(both))).toEqual(both);
    expect(parseMission(JSON.stringify({ ...both, tradition: 'other' })).type).toBe('math');
    expect(parseMission(JSON.stringify({ ...both, difficulty: undefined })).type).toBe('math');
  });

  it('describe themselves without any passage text', () => {
    expect(describeMission({ type: 'recitation', tradition: 'christianity' })).toBe('Recitation · Christianity · Daily passage');
    expect(describeMission({ type: 'reflection', difficulty: 'medium' })).toBe('Reflection · Medium · 2 min');
    expect(describeMission({ type: 'recitation_reflection', tradition: 'islam', difficulty: 'hard' })).toBe(
      'Recitation + Reflection · Islam · 4 min',
    );
  });
});
