import { describe, expect, it } from '@jest/globals';

import type { CompletionMode } from '@/features/alarms/alarm';

import { dayKeyAtOffset, localDayKey } from './day';
import { plural, rankDetail, xpEntryTitle } from './format';
import { buildMorning, type MorningOutcome } from './example-mornings';
import { PROGRESSION_POLICY, type ProgressionPolicy } from './policy';
import { dayResults, morningVerdict, rankFor, reachedAchievements, streaks, summarise, xpForMorning } from './progression';

/** Malaysia (UTC+8), independent of the computer running the tests. */
const dayKey = dayKeyAtOffset(480);
/** A moment in Malaysian local time, October 2026. */
const myt = (day: number, hour = 6, minute = 30) => Date.UTC(2026, 9, day, hour - 8, minute);

let seq = 0;
function morning(day: number, outcome: MorningOutcome, opts: { mode?: CompletionMode; hour?: number; alarmId?: string } = {}) {
  seq += 1;
  return buildMorning({
    id: `m${seq}`,
    alarmId: opts.alarmId ?? 'main',
    scheduledAt: myt(day, opts.hour ?? 6),
    outcome,
    mode: opts.mode,
  });
}

const streakOf = (history: ReturnType<typeof morning>[], today = myt(31), policy = PROGRESSION_POLICY) =>
  streaks(dayResults(history, dayKey), dayKey(today), policy);

describe('XP for one morning', () => {
  it('awards Education XP for a completed maths mission in Reward and Gentle mode', () => {
    for (const mode of ['reward', 'gentle'] as const) {
      expect(xpForMorning(morning(1, 'completed', { mode }), PROGRESSION_POLICY)).toEqual([
        expect.objectContaining({ category: 'education', amount: 10, reason: 'mission_completed' }),
      ]);
    }
  });

  it('adds the Challenge bonus on its own ledger line', () => {
    const o = morning(1, 'completed', { mode: 'challenge' });
    const xp = xpForMorning(o, PROGRESSION_POLICY);
    expect(xp.map((e) => [e.key, e.amount, e.reason])).toEqual([
      [`occ:${o.id}:mission`, 10, 'mission_completed'],
      [`occ:${o.id}:mode_bonus`, 5, 'mode_bonus'],
    ]);
  });

  it('gives nothing for incomplete, cancelled, open or mission-free mornings', () => {
    for (const outcome of ['missed', 'dismissed', 'cancelled', 'open'] as const) {
      expect(xpForMorning(morning(1, outcome), PROGRESSION_POLICY)).toEqual([]);
    }
    const noMission = buildMorning({ id: 'nm', scheduledAt: myt(1), outcome: 'turned_off', mission: { type: 'none' } });
    expect(xpForMorning(noMission, PROGRESSION_POLICY)).toEqual([]);
  });

  it('uses the policy, so beta can change values and categories without code changes', () => {
    const policy: ProgressionPolicy = {
      ...PROGRESSION_POLICY,
      missionCategory: { math: 'fitness' },
      missionXp: { math: 7 },
      modeBonusXp: { reward: 1, gentle: 0, challenge: 0 },
    };
    const xp = xpForMorning(morning(1, 'completed'), policy);
    expect(xp.map((e) => [e.category, e.amount])).toEqual([
      ['fitness', 7],
      ['fitness', 1],
    ]);
  });
});

describe('streak days', () => {
  it('counts consecutive successful days, and the longest run', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'missed'), morning(4, 'completed'), morning(5, 'completed'), morning(6, 'completed')];
    expect(streakOf(history)).toEqual({ current: 3, longest: 3, lastSuccessfulDay: '2026-10-06' });
  });

  it('a failed day breaks the streak; the longest is kept', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'completed'), morning(4, 'dismissed')];
    expect(streakOf(history)).toMatchObject({ current: 0, longest: 3 });
  });

  it('days with no alarm due, and cancelled alarms, neither break nor extend it', () => {
    // Weekend off (no alarms on the 3rd and 4th), and a cancelled alarm on the 6th.
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(5, 'completed'), morning(6, 'cancelled'), morning(7, 'completed')];
    expect(streakOf(history)).toMatchObject({ current: 4, longest: 4 });
  });

  it('several alarms on one day add one streak day, and a missed backup alarm doesn’t break it', () => {
    const history = [
      morning(1, 'completed'),
      morning(2, 'completed', { hour: 5 }),
      morning(2, 'completed', { hour: 6, alarmId: 'second' }),
      morning(3, 'completed', { hour: 5 }),
      morning(3, 'missed', { hour: 7, alarmId: 'backup' }),
    ];
    expect(streakOf(history)).toMatchObject({ current: 3, longest: 3 });
  });

  it('a day whose only alarms all failed breaks the streak', () => {
    const history = [morning(1, 'completed'), morning(2, 'missed', { hour: 5 }), morning(2, 'dismissed', { hour: 7, alarmId: 'b' })];
    expect(streakOf(history)).toMatchObject({ current: 0, longest: 1 });
  });

  it('today stays undecided while a morning is still open', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'open')];
    expect(streakOf(history, myt(3, 7))).toMatchObject({ current: 2 });
    // An earlier failure today doesn't break it while a later alarm is still open.
    const busy = [morning(1, 'completed'), morning(2, 'missed', { hour: 5 }), morning(2, 'open', { hour: 7, alarmId: 'b' })];
    expect(streakOf(busy, myt(2, 7))).toMatchObject({ current: 1 });
  });

  it('a mission-free alarm that was turned off is neutral', () => {
    const turnedOff = buildMorning({ id: 'off', scheduledAt: myt(2), outcome: 'turned_off', mission: { type: 'none' } });
    expect(morningVerdict(turnedOff)).toBe('neutral');
    expect(streakOf([morning(1, 'completed'), turnedOff, morning(3, 'completed')])).toMatchObject({ current: 2 });
  });

  it('uses the local calendar day the alarm was due (Malaysia time), not UTC or completion time', () => {
    // 07:30 MYT on the 2nd is 23:30 UTC on the 1st: in UTC both mornings would fall on one day.
    const history = [morning(1, 'completed', { hour: 6 }), buildMorning({ id: 'tz', scheduledAt: myt(2, 7, 30), outcome: 'completed' })];
    expect(dayResults(history, dayKey).map((d) => d.day)).toEqual(['2026-10-01', '2026-10-02']);
    expect(dayResults(history, dayKeyAtOffset(0)).map((d) => d.day)).toEqual(['2026-09-30', '2026-10-01']);
    // A 23:58 alarm finished after midnight still counts for the day it rang.
    const late = buildMorning({ id: 'late', scheduledAt: myt(5, 23, 58), outcome: 'completed' });
    expect(late.missionCompletedAt! > myt(6, 0, 0)).toBe(true);
    expect(dayResults([late], dayKey)[0].day).toBe('2026-10-05');
  });

  it('the phone’s own time zone is used by default', () => {
    const local = new Date(2026, 9, 3, 23, 59).getTime();
    expect(localDayKey(local)).toBe('2026-10-03');
    expect(localDayKey(local + 2 * 60_000)).toBe('2026-10-04');
  });

  it('can optionally expire a streak after a long gap (off by default)', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(10, 'completed')];
    expect(streakOf(history)).toMatchObject({ current: 3 });
    const strict = { ...PROGRESSION_POLICY, streak: { maxGapDays: 2 } };
    expect(streakOf(history, myt(10, 8), strict)).toMatchObject({ current: 1, longest: 2 });
    expect(streakOf(history, myt(14), strict)).toMatchObject({ current: 0 });
  });
});

describe('ranks', () => {
  it('moves up exactly at each threshold', () => {
    const t = [0, 50, 150];
    expect(rankFor(0, t)).toEqual({ level: 1, label: 'Rank 1', nextAt: 50 });
    expect(rankFor(49, t)).toMatchObject({ level: 1 });
    expect(rankFor(50, t)).toEqual({ level: 2, label: 'Rank 2', nextAt: 150 });
    expect(rankFor(149, t)).toMatchObject({ level: 2 });
    expect(rankFor(150, t)).toEqual({ level: 3, label: 'Rank 3', nextAt: null });
    expect(rankFor(10_000, t)).toMatchObject({ level: 3, nextAt: null });
  });
});

describe('achievements', () => {
  it('reports each reached achievement with the morning that reached it', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed', { mode: 'challenge' }), morning(3, 'completed')];
    const reached = reachedAchievements(history, dayResults(history, dayKey), PROGRESSION_POLICY);
    expect(reached.map((a) => [a.id, a.occurrenceId])).toEqual([
      ['first_morning', history[0].id],
      ['streak_3', history[2].id],
      ['first_challenge', history[1].id],
    ]);
  });

  it('a streak achievement is reached at any point, even if the streak later broke', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'completed'), morning(4, 'missed')];
    expect(reachedAchievements(history, dayResults(history, dayKey), PROGRESSION_POLICY).map((a) => a.id)).toContain('streak_3');
  });

  it('several successes on one day don’t count as several streak days', () => {
    const history = [morning(1, 'completed', { hour: 5 }), morning(1, 'completed', { hour: 6, alarmId: 'b' }), morning(1, 'completed', { hour: 7, alarmId: 'c' })];
    const ids = reachedAchievements(history, dayResults(history, dayKey), PROGRESSION_POLICY).map((a) => a.id);
    expect(ids).not.toContain('streak_3');
  });
});

describe('labels', () => {
  it('describes ledger lines and rank progress in plain language', () => {
    const base = { occurrenceId: 'o', category: null, amount: 10, earnedAt: 0 };
    expect(xpEntryTitle({ ...base, key: 'occ:o:mission', reason: 'mission_completed' }, PROGRESSION_POLICY)).toBe('Mission completed');
    expect(xpEntryTitle({ ...base, key: 'occ:o:mode_bonus', reason: 'mode_bonus' }, PROGRESSION_POLICY)).toBe('Challenge bonus');
    expect(xpEntryTitle({ ...base, key: 'ach:streak_3', reason: 'achievement' }, PROGRESSION_POLICY)).toBe('Achievement: 3-day streak');
    expect(rankDetail(40, rankFor(40, [0, 50]))).toBe('10 XP to Rank 2');
    expect(rankDetail(60, rankFor(60, [0, 50]))).toBe('Top rank');
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(3, 'day')).toBe('3 days');
  });
});

describe('summary', () => {
  it('prepares all three disciplines, even before Fitness and Faith missions exist', () => {
    const history = [morning(1, 'completed', { mode: 'challenge' })];
    const ledger = xpForMorning(history[0], PROGRESSION_POLICY);
    const s = summarise({ history, ledger, unlocked: [], policy: PROGRESSION_POLICY, dayKey, now: myt(1, 9) });
    expect(s.totalXp).toBe(15);
    expect(s.categoryXp).toEqual({ education: 15, fitness: 0, faith: 0 });
    expect(Object.keys(s.ranks)).toEqual(['overall', 'education', 'fitness', 'faith']);
    expect(s.ranks.fitness).toMatchObject({ level: 1, label: 'Rank 1' });
    expect(s).toMatchObject({ successfulMornings: 1, trackedMornings: 1, streak: { current: 1, longest: 1 } });
  });
});
