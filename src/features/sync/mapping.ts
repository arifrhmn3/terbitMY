import type { Alarm } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import type { AchievementUnlock, XpEntry } from '@/features/progress/progression';
import type { CloudAchievementRow, CloudAlarmRow, CloudOccurrenceRow, CloudXpRow } from '@/services/cloud';

/**
 * Local record → cloud row. The cloud mirrors the phone's canonical records
 * (alarms, occurrences, XP ledger, achievements); nothing derived (streaks,
 * totals, ranks) is sent, because it can always be recalculated.
 */

export function alarmToCloud(a: Alarm): CloudAlarmRow {
  return {
    id: a.id,
    hour: a.hour,
    minute: a.minute,
    weekdays: [...a.weekdays],
    enabled: a.enabled,
    label: a.label,
    mission: a.mission,
    snooze: a.snooze,
    is_main_wake_up: a.isPrimary,
    completion_mode: a.completionMode,
    gentle_reminder_minutes: a.gentleReminderMinutes,
    sound_id: a.soundId,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export function occurrenceToCloud(o: AlarmOccurrence): CloudOccurrenceRow {
  return {
    id: o.id,
    alarm_id: o.alarmId,
    scheduled_at: o.scheduledAt,
    source: o.source,
    status: o.status,
    alarm_label: o.alarmLabel,
    was_main_wake_up: o.isMainWakeUp,
    mission: o.mission,
    snooze_minutes: o.snoozeMinutes,
    completion_mode: o.completionMode,
    gentle_reminder_minutes: o.gentleReminderMinutes,
    fire_evidence: o.fireEvidence,
    started_at: o.startedAt,
    alarm_stopped_at: o.alarmStoppedAt,
    alarm_stop_reason: o.alarmStopReason,
    mission_started_at: o.missionStartedAt,
    mission_completed_at: o.missionCompletedAt,
    ended_at: o.endedAt,
    result: o.result,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

export function xpToCloud(e: XpEntry): CloudXpRow {
  return {
    award_key: e.key,
    occurrence_id: e.occurrenceId,
    category: e.category,
    amount: e.amount,
    reason: e.reason,
    earned_at: e.earnedAt,
  };
}

export function achievementToCloud(u: AchievementUnlock): CloudAchievementRow {
  return { id: u.id, unlocked_at: u.unlockedAt, occurrence_id: u.occurrenceId };
}

/**
 * A short fingerprint of a row's content. A record needs syncing when its
 * fingerprint differs from the one recorded at the last successful sync;
 * this also catches changes that don't touch `updated_at` (e.g. another alarm
 * losing its Main Wake-Up flag).
 */
export function fingerprint(row: unknown): string {
  const text = stableStringify(row);
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2, 33) ^ c;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${text.length}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
