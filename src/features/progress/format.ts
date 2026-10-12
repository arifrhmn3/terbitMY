import { CATEGORY_LABEL, type ProgressionPolicy } from './policy';
import type { ProgressSummary, Rank, XpEntry } from './progression';

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

/**
 * DEVELOPER DIAGNOSTICS: the XP accounting (total = disciplines + general/bonus),
 * every general/bonus ledger line with the occurrence that earned it, and the
 * morning vs all-alarm counters.
 */
export function diagnosticsText(summary: ProgressSummary, ledger: XpEntry[]): string {
  const { xp, morning, general } = summary;
  const lines = [
    `XP ${xp.total} = Education ${xp.byCategory.education} + Fitness ${xp.byCategory.fitness} + Faith ${xp.byCategory.faith} + General/Bonus ${xp.general}`,
  ];
  for (const e of ledger.filter((entry) => entry.category === null)) {
    const source = e.occurrenceId?.startsWith('seed_') ? 'developer seed morning' : `occurrence ${e.occurrenceId ?? '—'}`;
    lines.push(`  · ${e.key} +${e.amount} (${e.reason}) from ${source}, ${new Date(e.earnedAt).toLocaleString()}`);
  }
  const unlocked = summary.achievements.filter((a) => a.unlock).length;
  lines.push(
    `Mornings (main wake-up) ${morning.successful}/${morning.scheduled} · streak ${morning.streak.current} (longest ${morning.streak.longest}, last ${morning.streak.lastSuccessfulDay ?? '—'})`,
    `All alarms ${general.successful}/${general.scheduled} · missions ${general.missionsCompleted} · Challenge ${general.challengeCompletions} · achievements ${unlocked}/${summary.achievements.length} · ledger lines ${ledger.length}`,
  );
  return lines.join('\n');
}

export function rankDetail(xp: number, rank: Rank): string {
  return rank.nextAt === null ? 'Top rank' : `${rank.nextAt - xp} XP to Rank ${rank.level + 1}`;
}
