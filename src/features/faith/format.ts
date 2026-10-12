import type { DayKey } from '@/features/progress/day';

/** "Mon, 12 Oct 2026" for a 'YYYY-MM-DD' calendar date (no time-zone shift). */
export function formatDay(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
