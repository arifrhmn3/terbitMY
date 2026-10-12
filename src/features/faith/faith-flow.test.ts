import { describe, expect, it } from '@jest/globals';

import { createAlarmDraft, type AlarmMission, type CompletionMode } from '@/features/alarms/alarm';
import {
  completeMission,
  createOccurrence,
  dismissOccurrence,
  markAlarmFired,
  startMission,
  type AlarmOccurrence,
  type TransitionResult,
} from '@/features/alarms/occurrence';
import { buildMorning, type MorningOutcome } from '@/features/progress/example-mornings';
import { dayKeyAtOffset } from '@/features/progress/day';
import { PROGRESSION_POLICY } from '@/features/progress/policy';
import { createProgressEngine } from '@/features/progress/progress-engine';
import { createMemoryProgressRepository } from '@/features/progress/progress-repository';
import { xpForMorning } from '@/features/progress/progression';
import { createMemorySettingsStore } from '@/services/storage/settings';

import {
  faithSequenceResult,
  finishRecitationStage,
  finishReflectionStage,
  startFaithSequence,
  type CombinedFaithMissionConfig,
} from './combined';
import { faithDev } from './faith-dev';
import { createFaithServices, FAITH_SCHEDULES_KEY } from './faith-services';
import { recitationArchive } from './recitation/archive';
import { createMemoryRecitationCache } from './recitation/cache';
import type { RecitationMissionResult } from './recitation/types';
import { FALLBACK_TRACK_ID } from './reflection/music/catalogue';
import { dailyReflection, initialReflectionSchedule } from './reflection/schedule';
import { pickReflection, REFLECTION_SESSIONS_KEY, type ReflectionChoice } from './reflection/sessions';
import type { ReflectionMissionResult } from './reflection/types';
import { addDays } from './schedule';

const myt = (day: number, hour = 6) => Date.UTC(2026, 9, day, hour - 8, 30);
const dayKey = dayKeyAtOffset(480);

const RECITATION: AlarmMission = { type: 'recitation', tradition: 'islam' };
const REFLECTION: AlarmMission = { type: 'reflection', difficulty: 'easy' };
const COMBINED: AlarmMission = { type: 'recitation_reflection', tradition: 'islam', difficulty: 'medium' };
const CONFIG: CombinedFaithMissionConfig = { tradition: 'islam', difficulty: 'medium' };

const recited: RecitationMissionResult = {
  type: 'recitation',
  tradition: 'islam',
  date: '2026-10-12',
  assignmentId: 'daily-islam-2026-10-12',
  provider: 'dev-remote',
  contentId: 'islam-sample-b',
  reference: 'Sample passage B (development sample, not scripture)',
  sectionCount: 12,
  durationMs: 600_000,
  usedFallback: false,
  verification: 'self_reported',
};

const reflected: ReflectionMissionResult = {
  type: 'reflection',
  difficulty: 'medium',
  date: '2026-10-12',
  theme: 'gratitude',
  promptSetId: 'gratitude-1',
  trackId: 'reflection-001',
  trackTitle: 'Still Water',
  musicSource: 'cache',
  targetMs: 120_000,
  durationMs: 120_000,
};

/** An alarm occurrence that has rung and whose mission has started. */
function inProgress(mission: AlarmMission): AlarmOccurrence {
  const step = (r: TransitionResult) => {
    if (!r.ok) throw new Error(r.error);
    return r.occurrence;
  };
  const alarm = { ...createAlarmDraft({ mission, isPrimary: true }), id: 'main', createdAt: 0, updatedAt: 0 };
  const created = createOccurrence({ id: `o-${mission.type}`, alarm, scheduledAt: myt(12), source: 'simulated', now: myt(12) - 60_000 });
  const fired = step(markAlarmFired(created, myt(12)));
  return step(startMission(fired, myt(12) + 60_000));
}

function morning(day: number, mission: AlarmMission, opts: { outcome?: MorningOutcome; mode?: CompletionMode; mainWakeUp?: boolean } = {}) {
  return buildMorning({
    id: `m-${mission.type}-${day}-${opts.mainWakeUp === false ? 'b' : 'a'}`,
    alarmId: opts.mainWakeUp === false ? 'evening' : 'main',
    scheduledAt: myt(day, opts.mainWakeUp === false ? 20 : 6),
    outcome: opts.outcome ?? 'completed',
    mode: opts.mode,
    mainWakeUp: opts.mainWakeUp,
    mission,
  });
}

function engineFor(mornings: AlarmOccurrence[]) {
  const repo = createMemoryProgressRepository();
  return createProgressEngine({
    history: { listSince: async (since) => mornings.filter((o) => o.scheduledAt >= since) },
    repository: async () => repo,
    settings: createMemorySettingsStore(),
    now: () => myt(25, 12),
    dayKey,
  });
}

describe('Recitation-only and Reflection-only stay separate', () => {
  it('a Recitation alarm is done as soon as the Recitation is finished (no Reflection follows)', () => {
    const done = completeMission(inProgress(RECITATION), recited, myt(12) + 600_000);
    expect(done).toMatchObject({ ok: true, occurrence: { status: 'completed', result: { mission: { type: 'recitation' } } } });
  });

  it('a Reflection alarm is completed by its own Reflection, independently of Recitation', () => {
    expect(completeMission(inProgress(REFLECTION), { ...reflected, difficulty: 'easy' }, myt(12) + 120_000)).toMatchObject({
      ok: true,
      occurrence: { status: 'completed' },
    });
    expect(completeMission(inProgress(REFLECTION), recited, myt(12) + 120_000)).toEqual({ ok: false, error: 'wrong-mission' });
    expect(completeMission(inProgress(RECITATION), reflected, myt(12) + 120_000)).toEqual({ ok: false, error: 'wrong-mission' });
  });
});

describe('Recitation + Reflection (one alarm occurrence)', () => {
  it('runs Recitation, then Reflection, then completes once', () => {
    let s = startFaithSequence();
    expect(s.stage).toBe('recitation');
    s = finishRecitationStage(s, recited);
    expect(s.stage).toBe('reflection');
    expect(faithSequenceResult(s)).toBeNull();
    s = finishReflectionStage(s, CONFIG, reflected);
    expect(faithSequenceResult(s)).toEqual({
      type: 'recitation_reflection',
      tradition: 'islam',
      difficulty: 'medium',
      recitation: recited,
      reflection: reflected,
      durationMs: 720_000,
    });
    // Late or repeated callbacks never change a finished sequence.
    expect(finishRecitationStage(s, recited)).toBe(s);
    expect(finishReflectionStage(s, CONFIG, reflected)).toBe(s);
  });

  it('Reflection can’t be done first: Recitation can’t be skipped', () => {
    const s = startFaithSequence();
    expect(finishReflectionStage(s, CONFIG, reflected)).toBe(s);
    expect(faithSequenceResult(s)).toBeNull();
  });

  it('abandoning during either stage never completes the occurrence', () => {
    const occurrence = inProgress(COMBINED);
    // During Recitation, or during Reflection: there is no combined result yet.
    expect(faithSequenceResult(startFaithSequence())).toBeNull();
    expect(faithSequenceResult(finishRecitationStage(startFaithSequence(), recited))).toBeNull();
    // A single stage's result can't complete the combined alarm.
    expect(completeMission(occurrence, recited, myt(12) + 600_000)).toEqual({ ok: false, error: 'wrong-mission' });
    expect(completeMission(occurrence, reflected, myt(12) + 600_000)).toEqual({ ok: false, error: 'wrong-mission' });
    // Giving up ends it without a reward.
    const given = dismissOccurrence(occurrence, myt(12) + 700_000);
    expect(given.ok && given.occurrence.status).toBe('dismissed');
    if (given.ok) expect(xpForMorning(given.occurrence, PROGRESSION_POLICY)).toEqual([]);
    for (const outcome of ['dismissed', 'missed', 'open'] as const) {
      expect(xpForMorning(morning(3, COMBINED, { outcome }), PROGRESSION_POLICY)).toEqual([]);
    }
  });

  it('completes with the combined result', () => {
    const s = finishReflectionStage(finishRecitationStage(startFaithSequence(), recited), CONFIG, reflected);
    const done = completeMission(inProgress(COMBINED), faithSequenceResult(s)!, myt(12) + 720_000);
    expect(done).toMatchObject({ ok: true, occurrence: { status: 'completed', result: { mission: { type: 'recitation_reflection' } } } });
  });

  it('earns the Faith mission reward once (not once per stage), with the usual difficulty and Challenge bonuses', () => {
    expect(xpForMorning(morning(1, COMBINED), PROGRESSION_POLICY)).toEqual([
      expect.objectContaining({ category: 'faith', amount: 12, reason: 'mission_completed' }),
    ]);
    expect(xpForMorning(morning(1, COMBINED, { mode: 'challenge' }), PROGRESSION_POLICY).map((e) => [e.reason, e.amount])).toEqual([
      ['mission_completed', 12],
      ['mode_bonus', 5],
    ]);
  });

  it('reopening the result or syncing again never duplicates the XP', async () => {
    const o = morning(1, COMBINED, { mode: 'challenge' });
    const engine = engineFor([o]);
    const first = await engine.awardsForOccurrence(o.id);
    expect(first.xp.map((e) => e.amount)).toEqual([12, 5]);
    expect(first.achievements.map((a) => a.id)).toContain('first_faith');
    await Promise.all([engine.awardsForOccurrence(o.id), engine.sync(), engine.awardsForOccurrence(o.id)]);
    expect((await engine.summary()).xp).toEqual({ total: 17, byCategory: { education: 0, fitness: 0, faith: 17 }, general: 0 });
  });

  it('Main Wake-Up rule unchanged: a combined Main Wake-Up counts as the morning; other alarms don’t', async () => {
    const engine = engineFor([morning(1, COMBINED), morning(2, COMBINED), morning(2, COMBINED, { mainWakeUp: false })]);
    const s = await engine.summary();
    expect(s.morning).toMatchObject({ successful: 2, scheduled: 2 });
    expect(s.general).toMatchObject({ missionsCompleted: 3 });
  });
});

function services(day = 12) {
  const settings = createMemorySettingsStore();
  const faith = createFaithServices({
    settings,
    recitationCache: createMemoryRecitationCache(),
    trackFiles: { cachedUri: async () => null, download: async (t) => `file:///${t.externalAssetId}` },
    bundledTracks: { [FALLBACK_TRACK_ID]: 1 },
    musicBaseUrl: 'https://x.test/m',
    now: () => new Date(2026, 9, day, 12).getTime(),
  });
  return { settings, faith };
}

describe('Recitation archive (Recitation only)', () => {
  it('lists past Daily Recitations for the tradition, newest first, never the future', async () => {
    const { faith } = services();
    const rows = await recitationArchive(faith.recitation, 'islam', 30);
    expect(rows).toHaveLength(30);
    expect(rows[0].date).toBe('2026-10-12');
    expect(rows.every((r) => r.date <= '2026-10-12' && r.assignmentId === `daily-islam-${r.date}`)).toBe(true);
  });

  it('opens the exact canonical passage for a past date, fetching it online once and keeping it', async () => {
    const { faith } = services();
    const date = '2026-10-05';
    expect((await recitationArchive(faith.recitation, 'islam', 30)).find((r) => r.date === date)?.onPhone).toBe(false);
    const opened = await faith.recitation.open('islam', date);
    const assignment = await faith.recitation.assignment('islam', date);
    expect(opened).toMatchObject({ status: 'ok', fromCache: false, passage: { contentId: assignment?.contentId } });

    faithDev.set({ forceOffline: true });
    expect(await faith.recitation.open('islam', date)).toMatchObject({ status: 'ok', fromCache: true, passage: { contentId: assignment?.contentId } });
    expect((await recitationArchive(faith.recitation, 'islam', 30)).find((r) => r.date === date)?.onPhone).toBe(true);
    faithDev.set({ forceOffline: false });
  });

  it('contains no Reflection / Meditation sessions, even after several sessions', async () => {
    const { faith, settings } = services();
    const first = await faith.nextReflection();
    await faith.recordReflectionStart(first.date, first);
    await faith.recordReflectionStart(first.date, await faith.nextReflection());
    const rows = await recitationArchive(faith.recitation, 'islam', 30);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['assignmentId', 'date', 'onPhone']);
    // Session records live apart from the schedule history and are only today's.
    const log = await settings.get<{ date: string; started: unknown[] }>(REFLECTION_SESSIONS_KEY);
    expect(log).toMatchObject({ date: '2026-10-12' });
    expect(JSON.stringify(await settings.get(FAITH_SCHEDULES_KEY))).not.toContain('started');
  });
});

describe('several Reflection sessions on the same day', () => {
  const layers = initialReflectionSchedule();
  const date = '2026-10-12';
  const canonical = dailyReflection(layers, date);
  const choice = (p: ReflectionChoice): ReflectionChoice => ({ promptSetId: p.promptSetId, trackId: p.trackId });

  it('the first session of the day is today’s canonical Reflection', () => {
    expect(pickReflection(layers, date, [])).toEqual({ ...canonical, alternate: false });
  });

  it('a second session is a different, fresh session from the earlier pool (dated today, never history)', () => {
    const second = pickReflection(layers, date, [choice(canonical)]);
    expect(second).toMatchObject({ date, alternate: true });
    expect(second.promptSetId).not.toBe(canonical.promptSetId);
    expect(second.trackId).not.toBe(canonical.trackId);
    // It comes from Reflections scheduled on earlier days.
    const pool = Array.from({ length: 28 }, (_, i) => dailyReflection(layers, addDays(date, -(i + 1))).promptSetId);
    expect(pool).toContain(second.promptSetId);
  });

  it('later sessions avoid repeats: every prompt set is used before any repeats, and never twice in a row', () => {
    const started: ReflectionChoice[] = [choice(canonical)];
    for (let i = 0; i < 20; i++) {
      const next = pickReflection(layers, date, started);
      const last = started[started.length - 1];
      expect(next.promptSetId).not.toBe(last.promptSetId);
      expect(next.trackId).not.toBe(last.trackId);
      started.push(choice(next));
    }
    expect(new Set(started.slice(0, 8).map((s) => s.promptSetId)).size).toBe(8);
  });

  it('is deterministic: the same day and sessions give the same choice', () => {
    expect(pickReflection(layers, date, [choice(canonical)])).toEqual(pickReflection(initialReflectionSchedule(), date, [choice(canonical)]));
  });

  it('through the services: canonical first, alternate after a session starts, canonical again the next day', async () => {
    const today = services(12);
    const first = await today.faith.nextReflection();
    expect(first).toMatchObject({ ...canonical, alternate: false });
    // Opening without starting doesn't use up today's session.
    expect(await today.faith.nextReflection()).toEqual(first);
    await today.faith.recordReflectionStart(first.date, first);
    const second = await today.faith.nextReflection();
    expect(second.alternate).toBe(true);
    expect(second.promptSetId).not.toBe(first.promptSetId);

    const tomorrow = createFaithServices({
      settings: today.settings,
      recitationCache: createMemoryRecitationCache(),
      trackFiles: { cachedUri: async () => null, download: async (t) => `file:///${t.externalAssetId}` },
      bundledTracks: { [FALLBACK_TRACK_ID]: 1 },
      musicBaseUrl: null,
      now: () => new Date(2026, 9, 13, 7).getTime(),
    });
    expect(await tomorrow.nextReflection()).toMatchObject({ date: '2026-10-13', alternate: false });
  });

  it('an alternate session still plays offline: a track not on the phone falls back to the bundled track', async () => {
    const { faith } = services();
    const first = await faith.nextReflection();
    await faith.recordReflectionStart(first.date, first);
    const second = await faith.nextReflection();
    expect(await faith.music.resolve(second.trackId, { network: false, purpose: 'today' })).toMatchObject({ kind: 'fallback' });
  });
});
