import { describe, expect, it } from '@jest/globals';

import { migrate } from '@/services/storage/migrations';
import { openTestDatabase } from '@/services/storage/testing/node-sqlite';

import { addDays, applySchedule, layersOf, valueOn, type DailySchedule } from '../schedule';
import { FAITH_TRADITIONS, perTradition, type FaithTradition } from '../types';
import { createMemoryRecitationCache, createSqliteRecitationCache, passageChecksum } from './cache';
import {
  createDevBundledProvider,
  createDevRemoteProvider,
  DEV_BUNDLED_PROVIDER_ID,
  DEV_FALLBACK_CONTENT_ID,
  type FaithContentProvider,
} from './content';
import { estimateMinutes, isEligibleForDaily, rankForDaily } from './duration';
import { createRecitationLibrary } from './library';
import {
  BUNDLED_RECITATION_SCHEDULE,
  dailyRecitation,
  initialRecitationSchedules,
  type RecitationRef,
  type RecitationScheduleSet,
} from './schedule';
import {
  beginRecitation,
  confirmRecitation,
  createRecitationSession,
  nextPage,
  previousPage,
  recitationPhase,
  recitationProgress,
  recitationResult,
} from './session';
import type { RecitationPassage } from './types';

/** A trusted-source passage with text that must survive byte for byte. */
function sourcePassage(contentId: string, provider = 'trusted-test'): RecitationPassage {
  return {
    contentId,
    provider,
    tradition: 'islam',
    reference: 'Test 1:1–3',
    title: 'Test passage',
    originalLanguage: 'Arabic',
    direction: 'rtl',
    translationName: 'Test translation',
    transliterationName: 'Test transliteration',
    sourceCitation: 'Test source',
    // Unusual spacing, punctuation, diacritics and combining marks must be kept exactly.
    sections: [
      { number: '1', original: 'نَصٌّ  تَجْرِيبِيٌّ', transliteration: 'Naṣṣun  tajrībiyy', translation: 'A  “test”—text; kept exactly.' },
      { number: '2', original: 'ٱلْ ـ', transliteration: 'al-', translation: ' leading and trailing space ' },
      { number: '3', original: null, transliteration: null, translation: 'Café (combining accent)' },
    ],
    audio: null,
    estimatedMinutes: 15,
    review: 'source_verified',
    devFixture: false,
  };
}

function setup(opts: { today?: string } = {}) {
  const net = { online: true, calls: 0 };
  const clock = { today: opts.today ?? '2026-10-12' };
  const remoteBase = createDevRemoteProvider(() => net.online);
  const remote: FaithContentProvider = {
    ...remoteBase,
    async getPassage(id) {
      net.calls += 1;
      return remoteBase.getPassage(id);
    },
  };
  const cache = createMemoryRecitationCache();
  let schedules: RecitationScheduleSet = initialRecitationSchedules();
  const library = createRecitationLibrary({
    providers: { [DEV_BUNDLED_PROVIDER_ID]: createDevBundledProvider(), [remote.id]: remote },
    fallback: perTradition((t): RecitationRef => ({ provider: DEV_BUNDLED_PROVIDER_ID, contentId: DEV_FALLBACK_CONTENT_ID[t] })),
    cache,
    schedules: async () => schedules,
    today: () => clock.today,
    timeoutMs: 50,
  });
  return {
    net,
    clock,
    cache,
    library,
    setSchedules: (s: RecitationScheduleSet) => {
      schedules = s;
    },
    getSchedules: () => schedules,
  };
}

describe('Daily Recitation schedule', () => {
  const schedules = initialRecitationSchedules();

  it('same tradition + same date gives the same Recitation for everyone (deterministic, offline)', () => {
    const a = dailyRecitation(schedules, 'islam', '2026-10-15');
    const b = dailyRecitation(initialRecitationSchedules(), 'islam', '2026-10-15');
    expect(a).toEqual(b);
    expect(a?.id).toBe('daily-islam-2026-10-15');
  });

  it('a different date can give a different Recitation', () => {
    const ids = new Set(['2026-10-13', '2026-10-14', '2026-10-15'].map((d) => dailyRecitation(schedules, 'islam', d)?.contentId));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('each tradition uses its own schedule and its own content', () => {
    for (const t of FAITH_TRADITIONS) {
      expect(dailyRecitation(schedules, t, '2026-10-13')?.contentId.startsWith(`${t}-`)).toBe(true);
    }
    expect(dailyRecitation(schedules, 'islam', '2026-10-13')?.contentId.slice(-1)).not.toBe(
      dailyRecitation(schedules, 'christianity', '2026-10-13')?.contentId.slice(-1),
    );
  });

  it('an explicit published entry wins over the rotation', () => {
    expect(dailyRecitation(schedules, 'islam', '2026-10-12')?.contentId).toBe('islam-sample-b');
  });

  it('historical assignments never change when a newer schedule arrives; later dates follow it', () => {
    const today = '2026-10-12';
    const before = (d: string) => valueOn(schedules.islam, d);
    const pastAndProtected = ['2026-09-01', '2026-10-11', today, addDays(today, 1)].map(before);
    const newer: DailySchedule<RecitationRef> = {
      version: 2,
      entries: [{ date: '2026-10-11', value: { provider: 'x', contentId: 'changed' } }],
      segments: [{ from: '2026-01-01', values: [{ provider: 'x', contentId: 'new' }] }],
    };
    const layers = applySchedule(schedules.islam, newer, today);
    expect(['2026-09-01', '2026-10-11', today, addDays(today, 1)].map((d) => valueOn(layers, d))).toEqual(pastAndProtected);
    expect(valueOn(layers, addDays(today, 2))).toEqual({ provider: 'x', contentId: 'new' });
    // Re-applying the same or an older version changes nothing.
    expect(applySchedule(layers, newer, '2026-12-01')).toBe(layers);
    expect(applySchedule(layers, { ...newer, version: 1 }, '2026-12-01')).toBe(layers);
  });

  it('a schedule downloaded much later still can’t rewrite the dates already past', () => {
    let layers = layersOf(BUNDLED_RECITATION_SCHEDULE.islam);
    const v2: DailySchedule<RecitationRef> = { version: 2, entries: [], segments: [{ from: '2026-01-01', values: [{ provider: 'x', contentId: 'v2' }] }] };
    const v3: DailySchedule<RecitationRef> = { version: 3, entries: [], segments: [{ from: '2026-01-01', values: [{ provider: 'x', contentId: 'v3' }] }] };
    layers = applySchedule(layers, v2, '2026-10-12');
    layers = applySchedule(layers, v3, '2026-11-01');
    expect(valueOn(layers, '2026-10-12')).toEqual(valueOn(layersOf(BUNDLED_RECITATION_SCHEDULE.islam), '2026-10-12'));
    expect(valueOn(layers, '2026-10-20')).toEqual({ provider: 'x', contentId: 'v2' });
    expect(valueOn(layers, '2026-11-02')).toEqual({ provider: 'x', contentId: 'v2' });
    expect(valueOn(layers, '2026-11-03')).toEqual({ provider: 'x', contentId: 'v3' });
  });
});

describe('Recitation library: offline first', () => {
  it('future dates can’t be opened', async () => {
    const ctx = setup();
    expect(await ctx.library.open('islam', '2026-10-13')).toEqual({ status: 'future' });
    expect(ctx.net.calls).toBe(0);
  });

  it('the alarm mission never touches the network: without today’s passage it uses the local fallback', async () => {
    const ctx = setup();
    const opened = await ctx.library.forMission('islam');
    expect(opened.usedFallback).toBe(true);
    expect(opened.passage.contentId).toBe('islam-fallback');
    expect(opened.assignment?.id).toBe('daily-islam-2026-10-12');
    expect(ctx.net.calls).toBe(0);
  });

  it('once prepared (cached), today’s passage opens offline for the mission', async () => {
    const ctx = setup();
    expect(await ctx.library.prepare('islam')).toBe('cached');
    ctx.net.online = false;
    const opened = await ctx.library.forMission('islam');
    expect(opened).toMatchObject({ usedFallback: false, assignment: { id: 'daily-islam-2026-10-12' } });
    expect(opened.passage.contentId).toBe('islam-sample-b');
    expect(await ctx.library.prepare('islam')).toBe('already_cached');
  });

  it('tomorrow can be prepared ahead for an early alarm, but nothing further', async () => {
    const ctx = setup();
    expect(await ctx.library.prepare('islam', '2026-10-13')).toBe('cached');
    expect(await ctx.library.prepare('islam', '2026-10-14')).toBe('not_scheduled');
    ctx.clock.today = '2026-10-13';
    ctx.net.online = false;
    expect((await ctx.library.forMission('islam')).usedFallback).toBe(false);
  });

  it('a failed fetch (offline) gives the fallback, never an error', async () => {
    const ctx = setup();
    ctx.net.online = false;
    expect(await ctx.library.prepare('christianity')).toBe('failed');
    expect((await ctx.library.forMission('christianity')).passage.contentId).toBe('christianity-fallback');
  });

  it('archive: a past day needs internet the first time, is cached, then opens offline', async () => {
    const ctx = setup();
    ctx.net.online = false;
    expect(await ctx.library.open('hinduism', '2026-10-05')).toMatchObject({ status: 'unavailable' });
    ctx.net.online = true;
    const online = await ctx.library.open('hinduism', '2026-10-05');
    expect(online).toMatchObject({ status: 'ok', fromCache: false });
    ctx.net.online = false;
    const offline = await ctx.library.open('hinduism', '2026-10-05');
    expect(offline).toMatchObject({ status: 'ok', fromCache: true });
    // The same canonical passage both times.
    if (online.status === 'ok' && offline.status === 'ok') expect(offline.passage).toEqual(online.passage);
  });

  it('archive dates are today and earlier, newest first', () => {
    const ctx = setup();
    expect(ctx.library.archiveDates(3)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10']);
  });
});

describe('source text integrity', () => {
  it('stores and returns text exactly as the source provided it (SQLite round trip)', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const cache = createSqliteRecitationCache(db);
    const passage = sourcePassage('p1');
    await cache.put(passage, 1);
    const back = await cache.get('trusted-test', 'p1');
    expect(back).toEqual(passage);
    expect(back?.sections.map((s) => s.translation)).toEqual(passage.sections.map((s) => s.translation));
  });

  it('never returns stored text that was altered after it was saved', async () => {
    const db = openTestDatabase();
    await migrate(db);
    const cache = createSqliteRecitationCache(db);
    const passage = sourcePassage('p2');
    await cache.put(passage, 1);
    const altered = { ...passage, sections: [{ ...passage.sections[0], translation: 'A rewritten text.' }, ...passage.sections.slice(1)] };
    await db.runAsync('UPDATE faith_content_cache SET body = ? WHERE content_id = ?', JSON.stringify(altered), 'p2');
    expect(await cache.get('trusted-test', 'p2')).toBeNull();
    expect(passageChecksum(altered)).not.toBe(passageChecksum(passage));
  });

  it('the library passes provider text through unchanged', async () => {
    const passage = sourcePassage('p3', 'trusted');
    const library = createRecitationLibrary({
      providers: { trusted: { id: 'trusted', local: false, getPassage: async () => passage } },
      fallback: perTradition(() => ({ provider: 'trusted', contentId: 'p3' })),
      cache: createMemoryRecitationCache(),
      schedules: async () => perTradition(() => layersOf({ version: 1, entries: [], segments: [{ from: '2026-01-01', values: [{ provider: 'trusted', contentId: 'p3' }] }] })),
      today: () => '2026-10-12',
    });
    const opened = await library.open('islam', '2026-10-12');
    expect(opened.status === 'ok' && opened.passage).toEqual(passage);
  });

  it('development fixtures are marked and never claim to be reviewed or approved', async () => {
    const bundled = createDevBundledProvider();
    for (const t of FAITH_TRADITIONS) {
      const p = await bundled.getPassage(DEV_FALLBACK_CONTENT_ID[t]);
      expect(p).toMatchObject({ devFixture: true, review: 'draft' });
      expect(p?.reference).toMatch(/not scripture/);
    }
  });
});

describe('daily length', () => {
  it('every scheduled development passage is within 10–30 minutes', async () => {
    const remote = createDevRemoteProvider(() => true);
    const schedules = initialRecitationSchedules();
    for (const t of FAITH_TRADITIONS) {
      for (let i = 0; i < 6; i++) {
        const a = dailyRecitation(schedules, t, addDays('2026-10-10', i));
        const passage = a && (await remote.getPassage(a.contentId));
        expect(passage && isEligibleForDaily(passage)).toBe(true);
      }
    }
  });

  it('estimates from the text when no curator estimate exists, including only the layers shown', () => {
    const long = sourcePassage('x');
    long.estimatedMinutes = null;
    long.sections = Array.from({ length: 40 }, (_, i) => ({
      number: String(i + 1),
      original: 'word '.repeat(30),
      transliteration: 'word '.repeat(30),
      translation: 'word '.repeat(40),
    }));
    const full = estimateMinutes(long);
    const fewer = estimateMinutes(long, { showTransliteration: false, showTranslation: false });
    expect(full).toBeGreaterThan(fewer);
    expect(full).toBeGreaterThan(30);
    expect(isEligibleForDaily(long)).toBe(false); // over the 30-minute ceiling: choose another passage, never shorten it
  });

  it('curation ranks eligible passages closest to the 12–20 minute target first', () => {
    const at = (m: number) => ({ ...sourcePassage(`m${m}`), estimatedMinutes: m });
    expect(rankForDaily([at(28), at(5), at(15), at(11), at(45)]).map((p) => p.estimatedMinutes)).toEqual([15, 11, 28]);
  });
});

describe('Recitation session (self-reported)', () => {
  const opened = {
    passage: { ...sourcePassage('s'), sections: sourcePassage('s').sections.concat(sourcePassage('s').sections) },
    assignment: { id: 'daily-islam-2026-10-12', tradition: 'islam' as FaithTradition, date: '2026-10-12', provider: 'trusted-test', contentId: 's' },
    usedFallback: false,
  };

  it('Begin → page through with progress → confirm → done', () => {
    let s = createRecitationSession(6, 3);
    expect(recitationPhase(s)).toBe('ready');
    expect(confirmRecitation(s, 0)).toBe(s); // can't confirm before starting
    s = beginRecitation(s, 1000);
    expect(recitationProgress(s)).toBe(0.5);
    expect(confirmRecitation(s, 0)).toBe(s); // nor before reaching the end
    s = nextPage(s);
    expect(recitationProgress(s)).toBe(1);
    expect(recitationPhase(s)).toBe('reading');
    s = nextPage(s);
    expect(recitationPhase(s)).toBe('confirm');
    s = previousPage(s);
    expect(recitationPhase(s)).toBe('reading');
    s = confirmRecitation(nextPage(s), 61_000);
    expect(recitationPhase(s)).toBe('done');
    expect(recitationResult(s, opened, 'islam', '2026-10-12')).toEqual({
      type: 'recitation',
      tradition: 'islam',
      date: '2026-10-12',
      assignmentId: 'daily-islam-2026-10-12',
      provider: 'trusted-test',
      contentId: 's',
      reference: 'Test 1:1–3',
      sectionCount: 6,
      durationMs: 60_000,
      usedFallback: false,
      verification: 'self_reported',
    });
  });

  it('the progress bar follows the CURRENT page: Next raises it, Back lowers it, Next restores it', () => {
    let s = beginRecitation(createRecitationSession(12, 3), 0); // 4 pages
    const bar: number[] = [recitationProgress(s)];
    for (const move of [nextPage, nextPage, previousPage, nextPage, nextPage]) {
      s = move(s);
      bar.push(recitationProgress(s));
    }
    // Page 1 → 2 → 3 → back to 2 → 3 → 4
    expect(bar).toEqual([0.25, 0.5, 0.75, 0.5, 0.75, 1]);
    expect(previousPage(previousPage(previousPage(previousPage(s)))).page).toBe(0); // never below page 1
    expect(recitationProgress(previousPage(previousPage(previousPage(s))))).toBe(0.25);
  });

  it('completion still needs the end of the passage and the confirmation, however the reader moved', () => {
    let s = beginRecitation(createRecitationSession(12, 3), 0);
    s = previousPage(nextPage(nextPage(nextPage(s)))); // reached page 4, back to page 3
    expect(confirmRecitation(s, 1)).toBe(s); // going back from the last page doesn't allow confirming
    s = nextPage(s); // page 4
    expect(recitationPhase(s)).toBe('reading');
    expect(recitationResult(s, opened, 'islam', '2026-10-12')).toBeNull();
    s = nextPage(s); // confirmation step
    expect([recitationPhase(s), recitationProgress(s)]).toEqual(['confirm', 1]);
    s = previousPage(s); // Back from confirmation returns to the last page, not finished yet
    expect([recitationPhase(s), s.page]).toEqual(['reading', 3]);
    s = confirmRecitation(nextPage(s), 90_000);
    expect(recitationPhase(s)).toBe('done');

    // Once finished, Back/Next can't undo it and the result (and its XP) stays the same.
    const result = recitationResult(s, opened, 'islam', '2026-10-12');
    expect(result).toMatchObject({ type: 'recitation', durationMs: 90_000 });
    for (const after of [previousPage(s), nextPage(s), confirmRecitation(s, 999_000)]) {
      expect(after).toBe(s);
      expect(recitationProgress(after)).toBe(1);
      expect(recitationResult(after, opened, 'islam', '2026-10-12')).toEqual(result);
    }
  });

  it('a fallback passage is recorded as such, without the daily assignment', () => {
    const s = confirmRecitation(nextPage(beginRecitation(createRecitationSession(1), 0)), 5);
    expect(recitationResult(s, { ...opened, usedFallback: true }, 'islam', '2026-10-12')).toMatchObject({ usedFallback: true, assignmentId: null });
  });
});
