import type { SQLiteDatabase } from 'expo-sqlite';

import { parseCompletionMode, parseMission } from './alarm-repository';
import {
  ACTIVE_STATUSES,
  isActive,
  type AlarmOccurrence,
  type AlarmStopReason,
  type FireEvidence,
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
   * `expectedStatus` (and `updatedAt` equals `expectedUpdatedAt`, when
   * given). Returns false if something else changed it first, which is what
   * stops an occurrence being completed twice.
   */
  update(occurrence: AlarmOccurrence, expectedStatus: OccurrenceStatus, expectedUpdatedAt?: number): Promise<boolean>;
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
  completion_mode: string;
  gentle_reminder_minutes: number;
  fire_evidence: string;
  started_at: number | null;
  alarm_stopped_at: number | null;
  alarm_stop_reason: string | null;
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
    completion_mode: o.completionMode,
    gentle_reminder_minutes: o.gentleReminderMinutes,
    fire_evidence: o.fireEvidence,
    started_at: o.startedAt,
    alarm_stopped_at: o.alarmStoppedAt,
    alarm_stop_reason: o.alarmStopReason,
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
    return ['mission_completed', 'no_mission', 'emergency_dismiss', 'system_dismiss'].includes(value?.kind)
      ? value
      : null;
  } catch {
    return null;
  }
}

const FIRE_EVIDENCE: readonly FireEvidence[] = ['app', 'system', 'schedule'];
const STOP_REASONS: readonly AlarmStopReason[] = ['system', 'mission', 'dismiss', 'turn_off'];

function parseStatus(status: string): OccurrenceStatus {
  // 'started' was renamed 'alarm_fired' (migration 3); old rows may still say it.
  if (status === 'started') return 'alarm_fired';
  // An unknown status can't be trusted to be active; treat it as cancelled.
  return STATUSES.includes(status as OccurrenceStatus) ? (status as OccurrenceStatus) : 'cancelled';
}

export function rowToOccurrence(row: OccurrenceRow): AlarmOccurrence {
  return {
    id: row.id,
    alarmId: row.alarm_id,
    scheduledAt: row.scheduled_at,
    source: (row.source === 'native' ? 'native' : 'simulated') satisfies OccurrenceSource,
    status: parseStatus(row.status),
    alarmLabel: row.alarm_label,
    mission: parseMission(row.mission),
    snoozeMinutes: row.snooze_minutes,
    completionMode: parseCompletionMode(row.completion_mode),
    gentleReminderMinutes: row.gentle_reminder_minutes ?? 10,
    fireEvidence: FIRE_EVIDENCE.includes(row.fire_evidence as FireEvidence) ? (row.fire_evidence as FireEvidence) : 'app',
    startedAt: row.started_at,
    alarmStoppedAt: row.alarm_stopped_at,
    alarmStopReason: STOP_REASONS.includes(row.alarm_stop_reason as AlarmStopReason)
      ? (row.alarm_stop_reason as AlarmStopReason)
      : null,
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
            (id, alarm_id, scheduled_at, source, status, alarm_label, mission, snooze_minutes,
             completion_mode, gentle_reminder_minutes, fire_evidence, started_at, alarm_stopped_at,
             alarm_stop_reason, mission_started_at, mission_completed_at, ended_at, result, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          r.alarm_id,
          r.scheduled_at,
          r.source,
          r.status,
          r.alarm_label,
          r.mission,
          r.snooze_minutes,
          r.completion_mode,
          r.gentle_reminder_minutes,
          r.fire_evidence,
          r.started_at,
          r.alarm_stopped_at,
          r.alarm_stop_reason,
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

    async update(o, expectedStatus, expectedUpdatedAt) {
      const r = occurrenceToRow(o);
      const { changes } = await db.runAsync(
        `UPDATE alarm_occurrences
            SET status = ?, started_at = ?, alarm_stopped_at = ?, alarm_stop_reason = ?, mission_started_at = ?,
                mission_completed_at = ?, ended_at = ?, result = ?, updated_at = ?
          WHERE id = ? AND status = ? AND (? IS NULL OR updated_at = ?)`,
        r.status,
        r.started_at,
        r.alarm_stopped_at,
        r.alarm_stop_reason,
        r.mission_started_at,
        r.mission_completed_at,
        r.ended_at,
        r.result,
        r.updated_at,
        r.id,
        expectedStatus,
        expectedUpdatedAt ?? null,
        expectedUpdatedAt ?? null,
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

    async update(o, expectedStatus, expectedUpdatedAt) {
      const index = rows.findIndex(
        (r) =>
          r.id === o.id &&
          r.status === expectedStatus &&
          (expectedUpdatedAt === undefined || r.updated_at === expectedUpdatedAt),
      );
      if (index === -1) return false;
      rows = rows.map((r, i) => (i === index ? occurrenceToRow(o) : r));
      return true;
    },
  };
}
