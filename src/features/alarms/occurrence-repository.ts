import type { SQLiteDatabase } from 'expo-sqlite';

import { parseMission } from './alarm-repository';
import {
  ACTIVE_STATUSES,
  isActive,
  type AlarmOccurrence,
  type OccurrenceResult,
  type OccurrenceSource,
  type OccurrenceStatus,
} from './occurrence';

/** Thrown when an occurrence for the same alarm event, or a second active one, already exists. */
export class DuplicateOccurrenceError extends Error {
  constructor() {
    super('An occurrence for this alarm event already exists.');
    this.name = 'DuplicateOccurrenceError';
  }
}

export interface OccurrenceRepository {
  get(id: string): Promise<AlarmOccurrence | null>;
  findByEvent(alarmId: string, scheduledAt: number): Promise<AlarmOccurrence | null>;
  listActive(): Promise<AlarmOccurrence[]>;
  /** Newest first. */
  listRecent(limit: number): Promise<AlarmOccurrence[]>;
  /** Throws `DuplicateOccurrenceError` if the event already has an occurrence, or the alarm has an active one. */
  insert(occurrence: AlarmOccurrence): Promise<void>;
  /**
   * Saves the new state only if the stored status still equals
   * `expectedStatus`. Returns false if something else changed it first,
   * which is what stops an occurrence being completed twice.
   */
  update(occurrence: AlarmOccurrence, expectedStatus: OccurrenceStatus): Promise<boolean>;
}

export type OccurrenceRow = {
  id: string;
  alarm_id: string;
  scheduled_at: number;
  source: string;
  status: string;
  alarm_label: string;
  mission: string;
  snooze_minutes: number | null;
  started_at: number | null;
  mission_started_at: number | null;
  mission_completed_at: number | null;
  ended_at: number | null;
  result: string | null;
  created_at: number;
  updated_at: number;
};

const STATUSES: readonly OccurrenceStatus[] = [...ACTIVE_STATUSES, 'completed', 'dismissed', 'missed', 'cancelled'];

export function occurrenceToRow(o: AlarmOccurrence): OccurrenceRow {
  return {
    id: o.id,
    alarm_id: o.alarmId,
    scheduled_at: o.scheduledAt,
    source: o.source,
    status: o.status,
    alarm_label: o.alarmLabel,
    mission: JSON.stringify(o.mission),
    snooze_minutes: o.snoozeMinutes,
    started_at: o.startedAt,
    mission_started_at: o.missionStartedAt,
    mission_completed_at: o.missionCompletedAt,
    ended_at: o.endedAt,
    result: o.result ? JSON.stringify(o.result) : null,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function parseResult(json: string | null): OccurrenceResult | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as OccurrenceResult;
    return ['mission_completed', 'no_mission', 'emergency_dismiss'].includes(value?.kind) ? value : null;
  } catch {
    return null;
  }
}

export function rowToOccurrence(row: OccurrenceRow): AlarmOccurrence {
  return {
    id: row.id,
    alarmId: row.alarm_id,
    scheduledAt: row.scheduled_at,
    source: (row.source === 'native' ? 'native' : 'simulated') satisfies OccurrenceSource,
    // An unknown status can't be trusted to be active; treat it as cancelled.
    status: STATUSES.includes(row.status as OccurrenceStatus) ? (row.status as OccurrenceStatus) : 'cancelled',
    alarmLabel: row.alarm_label,
    mission: parseMission(row.mission),
    snoozeMinutes: row.snooze_minutes,
    startedAt: row.started_at,
    missionStartedAt: row.mission_started_at,
    missionCompletedAt: row.mission_completed_at,
    endedAt: row.ended_at,
    result: parseResult(row.result),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ACTIVE_SQL = ACTIVE_STATUSES.map((s) => `'${s}'`).join(', ');

type OccurrenceDatabase = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

/** Stores occurrences in the on-device SQLite database (iOS and Android). */
export function createSqliteOccurrenceRepository(db: OccurrenceDatabase): OccurrenceRepository {
  async function first(sql: string, ...params: (string | number)[]) {
    const row = await db.getFirstAsync<OccurrenceRow>(sql, ...params);
    return row ? rowToOccurrence(row) : null;
  }

  return {
    get: (id) => first('SELECT * FROM alarm_occurrences WHERE id = ?', id),

    findByEvent: (alarmId, scheduledAt) =>
      first('SELECT * FROM alarm_occurrences WHERE alarm_id = ? AND scheduled_at = ?', alarmId, scheduledAt),

    async listActive() {
      const rows = await db.getAllAsync<OccurrenceRow>(
        `SELECT * FROM alarm_occurrences WHERE status IN (${ACTIVE_SQL}) ORDER BY scheduled_at`,
      );
      return rows.map(rowToOccurrence);
    },

    async listRecent(limit) {
      const rows = await db.getAllAsync<OccurrenceRow>(
        'SELECT * FROM alarm_occurrences ORDER BY scheduled_at DESC LIMIT ?',
        limit,
      );
      return rows.map(rowToOccurrence);
    },

    async insert(o) {
      const r = occurrenceToRow(o);
      try {
        await db.runAsync(
          `INSERT INTO alarm_occurrences
            (id, alarm_id, scheduled_at, source, status, alarm_label, mission, snooze_minutes, started_at,
             mission_started_at, mission_completed_at, ended_at, result, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.alarm_id,
          r.scheduled_at,
          r.source,
          r.status,
          r.alarm_label,
          r.mission,
          r.snooze_minutes,
          r.started_at,
          r.mission_started_at,
          r.mission_completed_at,
          r.ended_at,
          r.result,
          r.created_at,
          r.updated_at,
        );
      } catch (error) {
        if (String(error).includes('UNIQUE constraint failed')) throw new DuplicateOccurrenceError();
        throw error;
      }
    },

    async update(o, expectedStatus) {
      const r = occurrenceToRow(o);
      const { changes } = await db.runAsync(
        `UPDATE alarm_occurrences
            SET status = ?, started_at = ?, mission_started_at = ?, mission_completed_at = ?,
                ended_at = ?, result = ?, updated_at = ?
          WHERE id = ? AND status = ?`,
        r.status,
        r.started_at,
        r.mission_started_at,
        r.mission_completed_at,
        r.ended_at,
        r.result,
        r.updated_at,
        r.id,
        expectedStatus,
      );
      return changes === 1;
    },
  };
}

/**
 * Keeps occurrences in memory, with the same duplicate rules as the SQLite
 * table. Used by unit tests and the web preview.
 */
export function createMemoryOccurrenceRepository(): OccurrenceRepository {
  let rows: OccurrenceRow[] = [];
  const read = (row: OccurrenceRow | undefined) => (row ? rowToOccurrence(row) : null);

  return {
    async get(id) {
      return read(rows.find((r) => r.id === id));
    },

    async findByEvent(alarmId, scheduledAt) {
      return read(rows.find((r) => r.alarm_id === alarmId && r.scheduled_at === scheduledAt));
    },

    async listActive() {
      return rows
        .map(rowToOccurrence)
        .filter(isActive)
        .sort((a, b) => a.scheduledAt - b.scheduledAt);
    },

    async listRecent(limit) {
      return rows
        .map(rowToOccurrence)
        .sort((a, b) => b.scheduledAt - a.scheduledAt)
        .slice(0, limit);
    },

    async insert(o) {
      const clash = rows.some(
        (r) =>
          r.id === o.id ||
          (r.alarm_id === o.alarmId && r.scheduled_at === o.scheduledAt) ||
          (r.alarm_id === o.alarmId && isActive(o) && isActive(rowToOccurrence(r))),
      );
      if (clash) throw new DuplicateOccurrenceError();
      rows = [...rows, occurrenceToRow(o)];
    },

    async update(o, expectedStatus) {
      const index = rows.findIndex((r) => r.id === o.id && r.status === expectedStatus);
      if (index === -1) return false;
      rows = rows.map((r, i) => (i === index ? occurrenceToRow(o) : r));
      return true;
    },
  };
}
