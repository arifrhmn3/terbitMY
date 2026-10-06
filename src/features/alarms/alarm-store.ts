import { useEffect, useSyncExternalStore } from 'react';

import {
  createAlarmId,
  normalizeWeekdays,
  sortAlarms,
  validateAlarm,
  withPrimary,
  type Alarm,
  type AlarmDraft,
} from './alarm';
import type { AlarmRepository } from './alarm-repository';
import type { AlarmService, AlarmSpec, ScheduleResult } from '@/services/alarm-scheduler';

export type AlarmStoreState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  alarms: Alarm[];
  error: string | null;
};

export function toAlarmSpec(alarm: Alarm): AlarmSpec {
  return {
    id: alarm.id,
    hour: alarm.hour,
    minute: alarm.minute,
    weekdays: [...alarm.weekdays],
    label: alarm.label,
    snoozeMinutes: alarm.snooze.enabled ? alarm.snooze.minutes : null,
    missionRequired: alarm.mission.type !== 'none',
  };
}

/**
 * Holds the saved alarms for the UI. Every change is written to the
 * repository first, then passed to `AlarmService`, which decides whether the
 * phone can actually ring it (today it always answers `not-implemented`).
 */
export function createAlarmStore(
  getRepository: () => Promise<AlarmRepository>,
  service: AlarmService,
  options: {
    now?: () => number;
    /** Called after an alarm is deleted, e.g. to cancel its active occurrence. */
    onRemove?: (id: string) => Promise<void>;
  } = {},
) {
  const { now = Date.now, onRemove } = options;
  let state: AlarmStoreState = { status: 'idle', alarms: [], error: null };
  const listeners = new Set<() => void>();

  function setState(next: Partial<AlarmStoreState>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }

  function sync(alarm: Alarm): Promise<ScheduleResult | null> {
    if (alarm.enabled) return service.schedule(toAlarmSpec(alarm));
    return service.cancel(alarm.id).then(() => null);
  }

  async function load() {
    setState({ status: 'loading', error: null });
    try {
      const repository = await getRepository();
      setState({ status: 'ready', alarms: await repository.list() });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function write(alarm: Alarm) {
    const repository = await getRepository();
    await repository.save(alarm);
    const others = state.alarms.filter((a) => a.id !== alarm.id);
    const alarms = [...others, alarm];
    setState({ alarms: sortAlarms(alarm.isPrimary ? withPrimary(alarms, alarm.id) : alarms) });
    return sync(alarm);
  }

  /** Creates a new alarm, or updates the one with `id`. */
  async function save(draft: AlarmDraft, id?: string) {
    const errors = validateAlarm(draft);
    if (errors.length > 0) throw new Error(`Invalid alarm: ${errors.join(', ')}`);

    const existing = id ? state.alarms.find((a) => a.id === id) : undefined;
    const timestamp = now();
    const alarm: Alarm = {
      ...draft,
      weekdays: normalizeWeekdays(draft.weekdays),
      label: draft.label.trim(),
      id: existing?.id ?? createAlarmId(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const result = await write(alarm);
    return { alarm, result };
  }

  async function setEnabled(id: string, enabled: boolean) {
    const alarm = state.alarms.find((a) => a.id === id);
    if (!alarm || alarm.enabled === enabled) return null;
    return write({ ...alarm, enabled, updatedAt: now() });
  }

  async function remove(id: string) {
    const repository = await getRepository();
    await repository.remove(id);
    setState({ alarms: state.alarms.filter((a) => a.id !== id) });
    await service.cancel(id);
    await onRemove?.(id);
  }

  /** Looks up a saved alarm, loading from storage first if needed. */
  async function find(id: string) {
    if (state.status !== 'ready') await load();
    return state.alarms.find((a) => a.id === id) ?? null;
  }

  return {
    getState: () => state,
    find,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    save,
    setEnabled,
    remove,
  };
}

export type AlarmStore = ReturnType<typeof createAlarmStore>;

/** Subscribes a component to the store and loads alarms on first use. */
export function useAlarmStore(store: AlarmStore) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    if (store.getState().status === 'idle') store.load();
  }, [store]);

  return state;
}
