import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AlarmMission } from '@/features/alarms/alarm';
import { resultKind } from '@/features/missions/result-kind';
import type { MissionResult } from '@/features/missions/types';
import { createMemorySettingsStore } from '@/services/storage/settings';

import { dayKeyAtOffset } from './day';
import { buildMorning } from './example-mornings';
import { PROGRESSION_POLICY } from './policy';
import { createProgressEngine } from './progress-engine';
import { createMemoryProgressRepository } from './progress-repository';
import type { ProgressSummary, XpEntry } from './progression';
import { rankChanges } from './result-progress';

const root = join(__dirname, '..', '..', '..');

function resultOf(mission: AlarmMission): MissionResult {
  const o = buildMorning({ id: 'x', scheduledAt: Date.UTC(2026, 9, 12, 22, 30), outcome: 'completed', mission });
  if (o.result?.kind !== 'mission_completed') throw new Error('no result');
  return o.result.mission;
}

describe('shared result layout', () => {
  it('every mission type gets its own summary inside the shared layout', () => {
    const missions: [AlarmMission, string][] = [
      [{ type: 'math', difficulty: 'easy', questionCount: 3 }, 'math'],
      [{ type: 'quiz', category: 'logic', difficulty: 'easy', questionCount: 3 }, 'quiz'],
      [{ type: 'fitness', exercise: 'squats', difficulty: 'easy' }, 'fitness'],
      [{ type: 'recitation', tradition: 'islam' }, 'recitation'],
      [{ type: 'reflection', difficulty: 'easy' }, 'reflection'],
      [{ type: 'recitation_reflection', tradition: 'islam', difficulty: 'easy' }, 'recitation_reflection'],
    ];
    for (const [mission, kind] of missions) expect(resultKind(resultOf(mission))).toBe(kind);
  });

  it('alarm results and practice results use the same layout and summaries (no copied result code)', () => {
    for (const file of ['src/features/alarms/components/alarm-ringing.tsx', 'src/app/(tabs)/alarms/practice.tsx']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).toContain('<MissionResultLayout');
      expect(source).toContain('<MissionResultSummary');
      expect(source).not.toMatch(/QuizResultSummary|FitnessResultSummary|MathResultSummary/);
    }
  });

  it('after a real alarm the action returns to Today; simulations go back where they started', () => {
    const ringing = readFileSync(join(root, 'src/features/alarms/components/alarm-ringing.tsx'), 'utf8');
    expect(ringing).toContain("occurrence.source !== 'simulated') returnToToday()");
    expect(ringing).toContain("'Back to Today'");
  });
});

const summaryWith = (total: number, byCategory: Partial<ProgressSummary['xp']['byCategory']>) =>
  ({ xp: { total, byCategory: { education: 0, fitness: 0, faith: 0, ...byCategory }, general: 0 } }) as ProgressSummary;
const entry = (amount: number, category: XpEntry['category'] = 'fitness'): XpEntry => ({
  key: `k${amount}`,
  occurrenceId: 'o',
  category,
  amount,
  reason: 'mission_completed',
  earnedAt: 0,
});

describe('rank changes on the result', () => {
  it('reports a rank-up in the discipline and overall, only when a threshold was crossed', () => {
    // Overall thresholds 0/50/150…, discipline thresholds 0/30/100…
    expect(rankChanges(summaryWith(52, { fitness: 32 }), [entry(12)], PROGRESSION_POLICY)).toEqual([
      { track: 'overall', label: 'Overall', from: 1, to: 2 },
      { track: 'fitness', label: 'Fitness', from: 1, to: 2 },
    ]);
    expect(rankChanges(summaryWith(40, { fitness: 20 }), [entry(10)], PROGRESSION_POLICY)).toEqual([]);
  });

  it('a Challenge bonus counts toward total XP but only mission XP toward the discipline', () => {
    const changes = rankChanges(summaryWith(50, { fitness: 29 }), [entry(10), { ...entry(5, null), key: 'b' }], PROGRESSION_POLICY);
    expect(changes).toEqual([{ track: 'overall', label: 'Overall', from: 1, to: 2 }]);
  });

  it('XP for a result is awarded once, however often the result is shown', async () => {
    const o = buildMorning({ id: 'm', scheduledAt: Date.UTC(2026, 9, 12, 22, 30), outcome: 'completed', mode: 'challenge' });
    const engine = createProgressEngine({
      history: { listSince: async () => [o] },
      repository: (() => {
        const repo = createMemoryProgressRepository();
        return async () => repo;
      })(),
      settings: createMemorySettingsStore(),
      now: () => Date.UTC(2026, 9, 13),
      dayKey: dayKeyAtOffset(480),
    });
    const first = await engine.awardsForOccurrence('m');
    await Promise.all([engine.awardsForOccurrence('m'), engine.awardsForOccurrence('m')]);
    expect((await engine.summary()).xp.total).toBe(first.xp.reduce((s, e) => s + e.amount, 0));
  });
});
