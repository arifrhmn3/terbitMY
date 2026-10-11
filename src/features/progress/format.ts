import { CATEGORY_LABEL, type ProgressionPolicy } from './policy';
import type { Rank, XpEntry } from './progression';

/** Plain-language labels for the Progress tab. Kept out of the screen so they're testable. */

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function xpEntryTitle(entry: XpEntry, policy: ProgressionPolicy): string {
  switch (entry.reason) {
    case 'mission_completed':
      return 'Mission completed';
    case 'mode_bonus':
      return 'Challenge bonus';
    case 'achievement': {
      const id = entry.key.replace(/^ach:/, '');
      const title = policy.achievements.find((a) => a.id === id)?.title;
      return title ? `Achievement: ${title}` : 'Achievement';
    }
  }
}

export function xpEntryDetail(entry: XpEntry): string {
  const when = new Date(entry.earnedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return entry.category ? `${when} · ${CATEGORY_LABEL[entry.category]}` : `${when} · Total XP`;
}

export function rankDetail(xp: number, rank: Rank): string {
  return rank.nextAt === null ? 'Top rank' : `${rank.nextAt - xp} XP to Rank ${rank.level + 1}`;
}
