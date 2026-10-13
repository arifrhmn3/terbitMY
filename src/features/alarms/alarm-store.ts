import { useEffect, useSyncExternalStore } from 'react';

import {
  createAlarmId,
  nextOccurrence,
  normalizeWeekdays,
  sortAlarms,
  validateAlarm,
  type Alarm,
  type AlarmDraft,
} from './alarm';
import { MODE_POLICIES } from './accountability';
import type { AlarmRepository } from './alarm-repository';
import { legacyMainWakeUpFixes, mainWakeUpOverlaps, resolveMainWakeUpOverlaps } from './main-wake-up';
import { snoozeSchedule } from './snooze';
import type { AlarmService, AlarmSpec, ScheduleResult } from '@/services/alarm-scheduler';

export type AlarmStoreState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  alarms: Alarm[];
  error: string | null;
};

/** The text the system alarm shows. Challenge mode points the user at the mission. */
export function alarmTitle(alarm: Alarm): string {
  const name = alarm.label || 'Terbit MY alarm';
  return alarm.completionMode === 'challenge' && alarm.mission.type !== 'none'
    ? `${name} · Challenge: open Terbit MY for your mission`
    : name;
}

/** What the native layer needs to schedule this alarm, as of `now`. */
export function toAlarmSpec(alarm: Alarm, now: number): AlarmSpec {
  const next = nextOccurrence({ ...alarm, enabled: true }, new Date(now));
  return {
    id: alarm.id,
    hour: alarm.hour,
    minute: alarm.minute,
    weekdays: [...alarm.weekdays],
    label: alarm.label,
    snoozeMinutes: alarm.snooze.enabled ? alarm.snooze.minutes : null,
    missionRequired: alarm.mission.type !== 'none',
    title: alarmTitle(alarm),
    // nextOccurrence always finds a time within 8 days for an enabled alarm.
    nextFireAt: next ? next.getTime() : now,
    completionMode: alarm.completionMode,
    actionLabel: MODE_POLICIES[alarm.completionMode].primaryActionLabel,
    actionIcon: MODE_POLICIES[alarm.completionMode].primaryActionIcon,
    soundId: alarm.soundId,
    snoozeOffsetsMinutes: snoozeOffsetsFor(alarm),
    snoozeLabel: `Snooze ${alarm.snooze.minutes} min`,
  };
}

/**
 * Native snooze rings for an alarm: only the Main Wake-Up snoozes (one
 * morning routine). The offsets come from `snoozeSchedule`, the same
 * calculation the Preview shows, so the phone rings exactly as previewed.
 */
export function snoozeOffsetsFor(alarm: Pick<Alarm, 'hour' | 'minute' | 'isPrimary' | 'snooze'>): number[] {
  if (!alarm.isPrimary || !alarm.snooze.enabled) return [];
  return snoozeSchedule(alarm, alarm.snooze)
    .slice(1)
    .map((ring) => ring.offsetMinutes);
}

/**
 * Holds the saved alarms for the UI. Every change is written to the
 * repository first, then passed to `AlarmService`: enabled alarms are
 * scheduled (or rescheduled) natively, disabled and deleted ones cancelled.
 */
export function createAlarmStore(
  getRepository: () => Promise<AlarmRepository>,
  service: AlarmService,
  options: {
    now?: () => number;
    /** Called after an alarm is deleted, e.g. to cancel its open morning and Gentle reminder. */
    onRemove?: (id: string) => Promise<void>;
    /**
     * How the alarm will actually behave given the user's entitlements (for
     * example Challenge falls back to Reward when unavailable). Saved settings
     * are never changed by this. Defaults to "as saved".
     */
    effective?: (alarm: Alarm) => Alarm;
  } = {},
) {
  const { now = Date.now, onRemove, effective = (alarm: Alarm) => alarm } = options;
  let state: AlarmStoreState = { status: 'idle', alarms: [], error: null };
  const listeners = new Set<() => void>();

  function setState(next: Partial<AlarmStoreState>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }

  function sync(alarm: Alarm): Promise<ScheduleResult | null> {
    if (alarm.enabled) return service.schedule(toAlarmSpec(effective(alarm), now()));
    return service.cancel(alarm.id).then(() => null);
  }

  /** Makes the native schedule match the enabled saved alarms (run when the app opens). */
  async function syncNative() {
    if (state.status !== 'ready') await load();
    const at = now();
    await service.syncAll(state.alarms.filter((a) => a.enabled).map((a) => toAlarmSpec(effective(a), at)));
  }

  /**
   * A one-off alarm has rung: turn it off in Terbit MY without touching the
   * native alarm (cancelling could silence it while it's still ringing).
   * `updatedAt` is kept, so the one-off still belongs to the date it rang
   * (a one-off Main Wake-Up stays that date's Main Wake-Up).
   */
  async function disableAfterRinging(id: string, firedAt: number) {
    const alarm = await find(id);
    if (!alarm || !alarm.enabled || alarm.weekdays.length > 0 || alarm.updatedAt > firedAt) return;
    const updated = { ...alarm, enabled: false };
    await (await getRepository()).save(updated);
    setState({ alarms: sortAlarms(state.alarms.map((a) => (a.id === id ? updated : a))) });
  }

  async function load() {
    setState({ status: 'loading', error: null });
    try {
      const repository = await getRepository();
      let alarms = await repository.list();
      // Older builds could leave overlapping Main Wake-Ups: fix them once, without deleting anything.
      const fixes = legacyMainWakeUpFixes(alarms);
      for (const fix of fixes) await repository.save(fix);
      if (fixes.length > 0) alarms = sortAlarms(alarms.map((a) => fixes.find((f) => f.id === a.id) ?? a));
      setState({ status: 'ready', alarms });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function write(alarm: Alarm): Promise<ScheduleResult | null> {
    const repository = await getRepository();
    await repository.save(alarm);
    setState({ alarms: sortAlarms([...state.alarms.filter((a) => a.id !== alarm.id), alarm]) });
    const result = await sync(alarm);
    // One Main Wake-Up per day (the user confirmed the replacement before saving):
    // a partly replaced Main Wake-Up keeps its other days and is re-scheduled now;
    // a fully replaced one is deleted (native alarm and snoozes cancelled, history kept).
    if (alarm.isPrimary && alarm.enabled) {
      const replaced = resolveMainWakeUpOverlaps(mainWakeUpOverlaps(alarm, state.alarms, alarm.id, now()));
      for (const update of replaced.update) await write({ ...update, updatedAt: now() });
      for (const old of replaced.remove) await remove(old.id);
    }
    return result;
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

  /**
   * Deletes a saved alarm: it leaves Today, Next alarm, the weekly schedule
   * and Manage straight away, and its future native alarm and any pending
   * snooze rings are cancelled (`onRemove` closes its open morning and Gentle
   * reminder). History is never deleted: past mornings, XP, streaks and
   * achievements are separate records.
   */
  async function remove(id: string) {
    const repository = await getRepository();
    await repository.remove(id);
    setState({ alarms: state.alarms.filter((a) => a.id !== id) });
    await service.cancel(id);
    await service.cancelSnoozes(id).catch(() => {});
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
    syncNative,
    disableAfterRinging,
    /** The alarm as it will actually behave now (entitlement-adjusted). */
    effective,
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
