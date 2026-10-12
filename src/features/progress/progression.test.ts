import { describe, expect, it } from '@jest/globals';

import type { CompletionMode } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';

import { dayKeyAtOffset, localDayKey } from './day';
import { plural, rankDetail, xpEntryTitle } from './format';
import { buildMorning, type MorningOutcome } from './example-mornings';
import { PROGRESSION_POLICY, type ProgressionPolicy } from './policy';
import {
  achievementXp,
  dayResults,
  morningVerdict,
  rankFor,
  reachedAchievements,
  streaks,
  summarise,
  xpForMorning,
  xpTotals,
} from './progression';

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
      missionCategory: {
        math: 'fitness',
        quiz: 'fitness',
        fitness: 'fitness',
        recitation: 'fitness',
        reflection: 'fitness',
        recitation_reflection: 'fitness',
      },
      missionXp: { math: 7, quiz: 7, fitness: 7, recitation: 7, reflection: 7, recitation_reflection: 7 },
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
    const reached = reachedAchievements(history, dayKey, PROGRESSION_POLICY);
    expect(reached.map((a) => [a.id, a.occurrenceId])).toEqual([
      ['first_morning', history[0].id],
      ['streak_3', history[2].id],
      ['first_challenge', history[1].id],
    ]);
  });

  it('a streak achievement is reached at any point, even if the streak later broke', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'completed'), morning(4, 'missed')];
    expect(reachedAchievements(history, dayKey, PROGRESSION_POLICY).map((a) => a.id)).toContain('streak_3');
  });

  it('several successes on one day don’t count as several streak days', () => {
    const history = [morning(1, 'completed', { hour: 5 }), morning(1, 'completed', { hour: 6, alarmId: 'b' }), morning(1, 'completed', { hour: 7, alarmId: 'c' })];
    const ids = reachedAchievements(history, dayKey, PROGRESSION_POLICY).map((a) => a.id);
    expect(ids).not.toContain('streak_3');
  });
});

describe('morning accountability (Main Wake-Up only) vs all alarms', () => {
  const summaryOf = (history: AlarmOccurrence[], now = myt(31)) =>
    summarise({
      history,
      ledger: history.flatMap((o) => xpForMorning(o, PROGRESSION_POLICY)),
      unlocked: [],
      policy: PROGRESSION_POLICY,
      dayKey,
      now,
    });
  const evening = (day: number, outcome: MorningOutcome, alarmId = 'fitness') =>
    buildMorning({ id: `ev${(seq += 1)}`, alarmId, scheduledAt: myt(day, 19), outcome, mainWakeUp: false });

  it('main wake-up completed: one scheduled, one successful morning', () => {
    expect(summaryOf([morning(1, 'completed')]).morning).toMatchObject({ successful: 1, scheduled: 1 });
  });

  it('main wake-up missed: scheduled but not successful', () => {
    expect(summaryOf([morning(1, 'missed')]).morning).toMatchObject({ successful: 0, scheduled: 1 });
  });

  it('a non-main alarm, completed or missed, never changes the morning counters', () => {
    const base = [morning(1, 'completed'), morning(2, 'completed'), morning(3, 'missed')];
    const before = summaryOf(base);
    expect(before.morning).toMatchObject({ successful: 2, scheduled: 3 });
    for (const extra of [evening(3, 'completed'), evening(3, 'missed'), evening(4, 'dismissed')]) {
      const after = summaryOf([...base, extra]);
      expect(after.morning).toEqual(before.morning);
    }
  });

  it('a non-main alarm still earns its XP and counts in general accountability', () => {
    const s = summaryOf([morning(1, 'completed'), evening(1, 'completed')]);
    expect(s.morning).toMatchObject({ successful: 1, scheduled: 1 });
    expect(s.general).toMatchObject({ successful: 2, scheduled: 2, missionsCompleted: 2 });
    expect(s.xp.byCategory.education).toBe(20);
  });

  it('several non-main alarms on one day don’t create mornings or streak days', () => {
    const s = summaryOf([evening(1, 'completed', 'a'), evening(1, 'completed', 'b'), evening(2, 'completed', 'a')]);
    expect(s.morning).toMatchObject({ successful: 0, scheduled: 0, streak: { current: 0, longest: 0 } });
    expect(s.general).toMatchObject({ successful: 3, scheduled: 3 });
  });

  it('main + non-main on the same day: only the main alarm decides the morning', () => {
    // Main missed, evening done: the morning failed and the streak breaks.
    const missedMorning = summaryOf([morning(1, 'completed'), morning(2, 'missed'), evening(2, 'completed')], myt(2, 21));
    expect(missedMorning.morning).toMatchObject({ successful: 1, scheduled: 2, streak: { current: 0, longest: 1 } });
    // Main done, evening missed: the morning succeeded and the streak continues.
    const missedEvening = summaryOf([morning(1, 'completed'), morning(2, 'completed'), evening(2, 'missed')], myt(2, 21));
    expect(missedEvening.morning).toMatchObject({ successful: 2, scheduled: 2, streak: { current: 2 } });
  });

  it('the morning streak uses only Main Wake-Up occurrences', () => {
    // Evening successes on days the main alarm was missed don't rescue the streak.
    const history = [morning(1, 'completed'), morning(2, 'missed'), evening(2, 'completed'), morning(3, 'completed')];
    expect(summaryOf(history).morning.streak).toMatchObject({ current: 1, longest: 1 });
  });

  it('changing which alarm is main: history keeps what each alarm was when it fired', () => {
    // Alarm A was main on the 1st and 2nd; then B became main. A keeps ringing as a non-main alarm.
    const history = [
      buildMorning({ id: 'a1', alarmId: 'A', scheduledAt: myt(1), outcome: 'completed', mainWakeUp: true }),
      buildMorning({ id: 'a2', alarmId: 'A', scheduledAt: myt(2), outcome: 'completed', mainWakeUp: true }),
      buildMorning({ id: 'b3', alarmId: 'B', scheduledAt: myt(3, 5), outcome: 'completed', mainWakeUp: true }),
      buildMorning({ id: 'a3', alarmId: 'A', scheduledAt: myt(3), outcome: 'missed', mainWakeUp: false }),
    ];
    const s = summaryOf(history);
    expect(s.morning).toMatchObject({ successful: 3, scheduled: 3, streak: { current: 3 } });
  });

  it('morning achievements need the main alarm; mission achievements count every alarm', () => {
    const evenings = Array.from({ length: 10 }, (_, i) => evening(i + 1, 'completed'));
    const ids = reachedAchievements(evenings, dayKey, PROGRESSION_POLICY).map((a) => a.id);
    expect(ids).toEqual(['missions_10']);
  });

  it('total XP = Education + Fitness + Faith + General/Bonus, exactly', () => {
    const history = [morning(1, 'completed'), morning(2, 'completed', { mode: 'challenge' }), morning(3, 'completed'), evening(3, 'completed')];
    const unlocked = reachedAchievements(history, dayKey, PROGRESSION_POLICY);
    const bonus = unlocked.flatMap((u) => {
      const entry = achievementXp(u, PROGRESSION_POLICY.achievements.find((a) => a.id === u.id)!);
      return entry ? [entry] : [];
    });
    const xp = xpTotals([...history.flatMap((o) => xpForMorning(o, PROGRESSION_POLICY)), ...bonus]);
    expect(xp).toEqual({ total: 55, byCategory: { education: 45, fitness: 0, faith: 0 }, general: 10 });
    expect(xp.total).toBe(xp.byCategory.education + xp.byCategory.fitness + xp.byCategory.faith + xp.general);
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
    expect(s.xp.total).toBe(15);
    expect(s.xp.byCategory).toEqual({ education: 15, fitness: 0, faith: 0 });
    expect(Object.keys(s.ranks)).toEqual(['overall', 'education', 'fitness', 'faith']);
    expect(s.ranks.fitness).toMatchObject({ level: 1, label: 'Rank 1' });
    expect(s.morning).toMatchObject({ successful: 1, scheduled: 1, streak: { current: 1, longest: 1 } });
  });
});
