/**
 * CONFLICT POLICY (Phase 2B).
 *
 * - Editable records (alarms): the copy with the newest `updated_at` wins; on
 *   a tie the incoming copy is taken (it is the same edit sent again). A
 *   deletion is a tombstone with its own time and follows the same rule.
 * - Event records that settle (occurrences): same rule. An occurrence only
 *   moves forward (scheduled → fired → completed…), and each step bumps
 *   `updated_at`, so the newest copy is also the most complete.
 * - Immutable records (XP ledger, achievements): inserted once by stable ID;
 *   a copy that already exists is never changed or duplicated.
 *
 * The server applies the same rules (`sync_alarms`, `sync_alarm_occurrences`,
 * insert-or-ignore upserts), so the result doesn't depend on which phone
 * syncs first. This function states the rule for code that merges copies.
 */
export function newerWins<T extends { updated_at: number }>(current: T | null | undefined, incoming: T): T {
  if (!current) return incoming;
  return incoming.updated_at >= current.updated_at ? incoming : current;
}
