import type { DayKey } from '@/features/progress/day';

import type { FaithTradition } from '../types';
import type { RecitationLibrary } from './library';

export type RecitationArchiveRow = { date: DayKey; assignmentId: string; onPhone: boolean };

/**
 * The Recitation archive: one row per past day (today included, never the
 * future) that has a Daily Recitation for the tradition, newest first. It
 * lists Recitations only; Reflection / Meditation sessions are never archived.
 */
export async function recitationArchive(
  library: Pick<RecitationLibrary, 'archiveDates' | 'assignment' | 'isOnPhone'>,
  tradition: FaithTradition,
  days: number,
): Promise<RecitationArchiveRow[]> {
  const rows = await Promise.all(
    library.archiveDates(days).map(async (date) => {
      const daily = await library.assignment(tradition, date);
      return daily ? { date, assignmentId: daily.id, onPhone: await library.isOnPhone(tradition, date) } : null;
    }),
  );
  return rows.filter((r): r is RecitationArchiveRow => r !== null);
}
