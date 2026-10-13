import { CATEGORY_LABEL, type ProgressionPolicy } from './policy';
import { rankFor, type ProgressSummary, type RankTrack, type XpEntry } from './progression';

export type RankChange = { track: RankTrack; label: string; from: number; to: number };

/**
 * Ranks a mission's XP just moved up (total and its discipline), worked out
 * by comparing each rank before and after `gained` against the policy's
 * thresholds. `summary` must already include the gained XP.
 */
export function rankChanges(summary: ProgressSummary, gained: readonly XpEntry[], policy: ProgressionPolicy): RankChange[] {
  const changes: RankChange[] = [];
  const total = gained.reduce((sum, e) => sum + e.amount, 0);
  const overallTo = rankFor(summary.xp.total, policy.overallRankThresholds).level;
  const overallFrom = rankFor(summary.xp.total - total, policy.overallRankThresholds).level;
  if (overallTo > overallFrom) changes.push({ track: 'overall', label: 'Overall', from: overallFrom, to: overallTo });

  const byCategory = new Map<NonNullable<XpEntry['category']>, number>();
  for (const e of gained) if (e.category) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  for (const [category, amount] of byCategory) {
    const now = summary.xp.byCategory[category];
    const to = rankFor(now, policy.categoryRankThresholds).level;
    const from = rankFor(now - amount, policy.categoryRankThresholds).level;
    if (to > from) changes.push({ track: category, label: CATEGORY_LABEL[category], from, to });
  }
  return changes;
}
