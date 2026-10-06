import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createAlarmDraft,
  normalizeWeekdays,
  SNOOZE_MINUTES,
  sortAlarms,
  type Alarm,
  type AlarmMission,
  type SnoozeMinutes,
  type Weekday,
} from './alarm';
import { MATH_DIFFICULTIES, MATH_QUESTION_COUNTS } from '@/features/missions/math/questions';

/** Saves and loads alarm settings. It never schedules or rings an alarm. */
export interface AlarmRepository {
  list(): Promise<Alarm[]>;
  /** Inserts or updates. If the alarm is primary, every other alarm stops being primary. */
  save(alarm: Alarm): Promise<void>;
  remove(id: string): Promise<void>;
}

export type AlarmRow = {
  id: string;
  hour: number;
  minute: number;
  weekdays: string;
  enabled: number;
  label: string;
  mission: string;
  snooze_enabled: number;
  snooze_minutes: number;
  is_primary: number;
  created_at: number;
  updated_at: number;
};

export function alarmToRow(alarm: Alarm): AlarmRow {
  return {
    id: alarm.id,
    hour: alarm.hour,
    minute: alarm.minute,
    weekdays: normalizeWeekdays(alarm.weekdays).join(','),
    enabled: alarm.enabled ? 1 : 0,
    label: alarm.label,
    mission: JSON.stringify(alarm.mission),
    snooze_enabled: alarm.snooze.enabled ? 1 : 0,
    snooze_minutes: alarm.snooze.minutes,
    is_primary: alarm.isPrimary ? 1 : 0,
    created_at: alarm.createdAt,
    updated_at: alarm.updatedAt,
  };
}

/** Reads the stored mission, falling back to the default if it can't be understood. */
export function parseMission(json: string): AlarmMission {
  try {
    const value = JSON.parse(json) as Partial<Record<string, unknown>>;
    if (value?.type === 'none') return { type: 'none' };
    if (
      value?.type === 'math' &&
      MATH_DIFFICULTIES.includes(value.difficulty as never) &&
      MATH_QUESTION_COUNTS.includes(value.questionCount as never)
    ) {
      return value as AlarmMission;
    }
  } catch {
    // fall through to the default
  }
  return createAlarmDraft().mission;
}

export function rowToAlarm(row: AlarmRow): Alarm {
  const weekdays = row.weekdays
    .split(',')
    .filter((d) => d !== '')
    .map(Number)
    .filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6);
  const snoozeMinutes = SNOOZE_MINUTES.includes(row.snooze_minutes as SnoozeMinutes)
    ? (row.snooze_minutes as SnoozeMinutes)
    : 5;

  return {
    id: row.id,
    hour: row.hour,
    minute: row.minute,
    weekdays: normalizeWeekdays(weekdays),
    enabled: row.enabled === 1,
    label: row.label,
    mission: parseMission(row.mission),
    snooze: { enabled: row.snooze_enabled === 1, minutes: snoozeMinutes },
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type AlarmDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync' | 'withTransactionAsync'>;

/** Stores alarms in the on-device SQLite database (iOS and Android). */
export function createSqliteAlarmRepository(db: AlarmDatabase): AlarmRepository {
  return {
    async list() {
      const rows = await db.getAllAsync<AlarmRow>('SELECT * FROM alarms ORDER BY hour, minute, created_at');
      return rows.map(rowToAlarm);
    },

    async save(alarm) {
      const row = alarmToRow(alarm);
      await db.withTransactionAsync(async () => {
        if (alarm.isPrimary) {
          await db.runAsync('UPDATE alarms SET is_primary = 0 WHERE id != ? AND is_primary = 1', alarm.id);
        }
        await db.runAsync(
          `INSERT OR REPLACE INTO alarms
            (id, hour, minute, weekdays, enabled, label, mission, snooze_enabled, snooze_minutes, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.hour,
          row.minute,
          row.weekdays,
          row.enabled,
          row.label,
          row.mission,
          row.snooze_enabled,
          row.snooze_minutes,
          row.is_primary,
          row.created_at,
          row.updated_at,
        );
      });
    },

    async remove(id) {
      await db.runAsync('DELETE FROM alarms WHERE id = ?', id);
    },
  };
}

/**
 * Keeps alarms in memory only. Used by unit tests and by the web preview,
 * where alarms are lost when the page reloads.
 */
export function createMemoryAlarmRepository(initial: Alarm[] = []): AlarmRepository {
  let rows = initial.map(alarmToRow);

  return {
    async list() {
      return sortAlarms(rows.map(rowToAlarm));
    },

    async save(alarm) {
      const row = alarmToRow(alarm);
      rows = rows
        .filter((r) => r.id !== alarm.id)
        .map((r) => (alarm.isPrimary ? { ...r, is_primary: 0 } : r))
        .concat(row);
    },

    async remove(id) {
      rows = rows.filter((r) => r.id !== id);
    },
  };
}
