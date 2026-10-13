import type { SQLiteDatabase } from 'expo-sqlite';

import type { Weekday } from '@/features/alarms/alarm';

import { createNightRoutineDraft, EMPTY_SELECTION, type ClockTime, type NightActivity, type NightRoutine } from './night-routine';

/** Saves and loads the Night Routine. It never schedules anything. On this phone only (not part of cloud backup). */
export interface NightRoutineRepository {
  get(id: string): Promise<NightRoutine | null>;
  save(routine: NightRoutine): Promise<void>;
  remove(id: string): Promise<void>;
}

type Row = { id: string; config: string; created_at: number; updated_at: number };

const ACTIVITIES: readonly NightActivity[] = ['none', 'reflection', 'breathing'];

const clock = (value: unknown, fallback: ClockTime): ClockTime => {
  const t = value as Partial<ClockTime> | null;
  return t && Number.isInteger(t.hour) && Number.isInteger(t.minute) && t.hour! >= 0 && t.hour! < 24 && t.minute! >= 0 && t.minute! < 60
    ? { hour: t.hour!, minute: t.minute! }
    : fallback;
};

const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0);

/**
 * Reads stored JSON defensively: anything missing or invalid falls back to the
 * defaults. Unknown keys are dropped, including `restrictionStart` from
 * routines saved before restrictions followed wind-down: such a routine keeps
 * its wind-down, bedtime and apps, and is restricted from wind-down from now on.
 */
export function routineFromRow(row: Row): NightRoutine {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(row.config) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const d = createNightRoutineDraft();
  const selection = (raw.selection ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    weekdays: Array.isArray(raw.weekdays)
      ? [...new Set(raw.weekdays.filter((w): w is Weekday => Number.isInteger(w) && w >= 0 && w <= 6))].sort()
      : d.weekdays,
    windDown: clock(raw.windDown, d.windDown),
    bedtime: clock(raw.bedtime, d.bedtime),
    restrictApps: typeof raw.restrictApps === 'boolean' ? raw.restrictApps : d.restrictApps,
    selection:
      typeof selection.token === 'string'
        ? {
            token: selection.token,
            applications: count(selection.applications),
            categories: count(selection.categories),
            webDomains: count(selection.webDomains),
          }
        : { ...EMPTY_SELECTION },
    endRule: raw.endRule === 'fixed_time' ? 'fixed_time' : 'main_wake_up',
    fallbackEnd: clock(raw.fallbackEnd, d.fallbackEnd),
    activity: ACTIVITIES.includes(raw.activity as NightActivity) ? (raw.activity as NightActivity) : d.activity,
    windDownReminder: typeof raw.windDownReminder === 'boolean' ? raw.windDownReminder : d.windDownReminder,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function routineToRow(routine: NightRoutine): Row {
  const { id, createdAt, updatedAt, ...config } = routine;
  return { id, config: JSON.stringify(config), created_at: createdAt, updated_at: updatedAt };
}

export function createSqliteNightRoutineRepository(db: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>): NightRoutineRepository {
  return {
    async get(id) {
      const row = await db.getFirstAsync<Row>('SELECT id, config, created_at, updated_at FROM night_routines WHERE id = ?', id);
      return row ? routineFromRow(row) : null;
    },
    async save(routine) {
      const row = routineToRow(routine);
      await db.runAsync(
        'INSERT OR REPLACE INTO night_routines (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)',
        row.id,
        row.config,
        row.created_at,
        row.updated_at,
      );
    },
    async remove(id) {
      await db.runAsync('DELETE FROM night_routines WHERE id = ?', id);
    },
  };
}

/** In memory, for tests and the web preview. */
export function createMemoryNightRoutineRepository(): NightRoutineRepository {
  const rows = new Map<string, Row>();
  return {
    async get(id) {
      const row = rows.get(id);
      return row ? routineFromRow(row) : null;
    },
    async save(routine) {
      rows.set(routine.id, routineToRow(routine));
    },
    async remove(id) {
      rows.delete(id);
    },
  };
}
