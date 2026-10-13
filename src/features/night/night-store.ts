import { useEffect, useSyncExternalStore } from 'react';

import type { Alarm } from '@/features/alarms/alarm';
import { formatAlarmTime } from '@/features/alarms/alarm';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { localDayKey } from '@/features/progress/day';
import type { ScreenTimeAuthorization, ScreenTimeService, ScreenTimeState } from '@/services/screen-time';

import type { NightRoutineRepository } from './night-repository';
import { NIGHT_ROUTINE_ID, restrictsApps, validateNightRoutine, type NightRoutine, type NightRoutineDraft } from './night-routine';
import { appliesOnEvening, atNight, nativeRestrictionPlan, restrictionState, type RestrictionState } from './night-timeline';

export type NightStoreState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  routine: NightRoutine | null;
  authorization: ScreenTimeAuthorization | 'checking';
  /** What the phone reports (shield on, ended early until…). */
  native: ScreenTimeState;
  /** The last native scheduling problem, if any (shown on the routine screen). */
  scheduleError: string | null;
};

type Reminders = { schedule(r: { id: string; title: string; body: string; fireAt: number }): Promise<unknown>; cancel(id: string): Promise<void> };

/** One wind-down reminder per evening, so re-scheduling replaces it. */
export const windDownReminderId = (evening: number) => `night-wind-down-${localDayKey(evening)}`;

/** How many evenings ahead wind-down reminders are kept scheduled (refreshed each time Terbit MY opens). */
export const REMINDER_DAYS = 7;

/**
 * Holds the Night Routine for the UI. Saving writes to the phone's database
 * first (the routine is canonical there), then makes the native Screen Time
 * schedule and the wind-down reminders match. Works with no internet or
 * account; restrictions are skipped (not faked) when Screen Time isn't available.
 */
export function createNightStore(deps: {
  getRepository: () => Promise<NightRoutineRepository>;
  screenTime: ScreenTimeService;
  /** Local notifications (optional: not every platform has them). */
  reminders?: Reminders;
  /** The saved alarms right now (for the next Main Wake-Up). */
  alarms: () => readonly Alarm[];
  /** Recent mornings (a one-off Main Wake-Up that already rang still owns its date). */
  recorded?: () => Promise<readonly AlarmOccurrence[]>;
  now?: () => number;
}) {
  const { getRepository, screenTime, reminders, alarms, recorded = async () => [], now = Date.now } = deps;
  let state: NightStoreState = {
    status: 'idle',
    routine: null,
    authorization: 'checking',
    native: { shieldActive: false, overriddenUntil: null, monitoring: [] },
    scheduleError: null,
  };
  const listeners = new Set<() => void>();
  let syncing: Promise<void> | null = null;

  function setState(next: Partial<NightStoreState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  }

  async function refreshAuthorization() {
    const authorization = await screenTime.getAuthorization().catch(() => 'unavailable' as const);
    setState({ authorization });
    return authorization;
  }

  async function load() {
    setState({ status: 'loading' });
    try {
      const routine = await (await getRepository()).get(NIGHT_ROUTINE_ID);
      setState({ status: 'ready', routine });
      await refreshAuthorization();
      if (state.authorization === 'approved') setState({ native: await screenTime.getState().catch(() => state.native) });
    } catch {
      setState({ status: 'error' });
    }
  }

  async function ensureLoaded() {
    if (state.status !== 'ready') await load();
  }

  /** Wind-down reminders for the coming evenings; every other one is cancelled. */
  async function syncReminders(routine: NightRoutine | null) {
    if (!reminders) return;
    const at = now();
    for (let offset = -1; offset <= REMINDER_DAYS; offset++) {
      const d = new Date(at);
      const evening = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
      const id = windDownReminderId(evening.getTime());
      const fireAt = routine ? atNight(evening, routine.windDown) : 0;
      if (routine && routine.enabled && routine.windDownReminder && appliesOnEvening(routine, evening) && fireAt > at && offset < REMINDER_DAYS) {
        // It fires at wind-down, when restrictions start (only claimed when Screen Time can actually restrict).
        const restricted = restrictsApps(routine) && state.authorization === 'approved' ? ' Your chosen apps are restricted from now.' : '';
        await reminders
          .schedule({ id, title: 'Time to wind down', body: `Bedtime is ${formatAlarmTime(routine.bedtime)}.${restricted}`, fireAt })
          .catch(() => {});
      } else {
        await reminders.cancel(id).catch(() => {});
      }
    }
  }

  /**
   * Makes the phone match the routine: the Screen Time schedule (only when
   * authorised in a build that includes it) and the wind-down reminders.
   * Run after saving, when alarms change (the Main Wake-Up sets the end),
   * and whenever Terbit MY opens. Safe to repeat.
   */
  function sync(): Promise<void> {
    syncing ??= (async () => {
      try {
        await ensureLoaded();
        const routine = state.routine;
        const authorization = await refreshAuthorization();
        if (authorization === 'approved') {
          const native = await screenTime.getState().catch(() => state.native);
          const override = native.overriddenUntil ? { until: native.overriddenUntil } : null;
          const plan = nativeRestrictionPlan({ routine, alarms: alarms(), now: now(), override, recorded: await recorded().catch(() => []) });
          if (plan) {
            const result = await screenTime.apply(plan);
            setState({ scheduleError: result.errors.length > 0 ? result.errors.join('; ') : null });
          } else {
            await screenTime.clear();
            setState({ scheduleError: null });
          }
          setState({ native: await screenTime.getState().catch(() => native) });
        }
        await syncReminders(routine);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  async function save(draft: NightRoutineDraft): Promise<NightRoutine> {
    const errors = validateNightRoutine(draft);
    if (errors.length > 0) throw new Error(errors.join('. '));
    await ensureLoaded();
    const at = now();
    const routine: NightRoutine = {
      ...draft,
      weekdays: [...new Set(draft.weekdays)].sort(),
      id: NIGHT_ROUTINE_ID,
      createdAt: state.routine?.createdAt ?? at,
      updatedAt: at,
    };
    await (await getRepository()).save(routine);
    setState({ routine });
    await sync();
    return routine;
  }

  /** Deletes the routine: its schedule, restrictions and reminders stop. Nothing else is touched. */
  async function remove() {
    await ensureLoaded();
    await (await getRepository()).remove(NIGHT_ROUTINE_ID);
    setState({ routine: null });
    if (state.authorization === 'approved') await screenTime.clear().catch(() => {});
    await syncReminders(null);
  }

  /** Shows Apple's Screen Time request. Only ever called after the user taps. */
  async function requestAuthorization() {
    const result = await screenTime.requestAuthorization();
    setState({ authorization: result.status });
    if (result.status === 'approved') await sync();
    return result;
  }

  /** The restriction state right now (for Today and the routine screen). */
  function restriction(at: number = now(), mornings: readonly AlarmOccurrence[] = []): RestrictionState {
    const override = state.native.overriddenUntil ? { until: state.native.overriddenUntil } : null;
    return restrictionState({ routine: state.routine, alarms: alarms(), now: at, available: state.authorization === 'approved', override, recorded: mornings });
  }

  /**
   * The deliberate "end tonight's restrictions": the screen confirms first.
   * Restrictions come back automatically from the next night.
   */
  async function endTonight() {
    const current = restriction();
    if (current.kind !== 'active') return false;
    await screenTime.endTonight(current.endsAt);
    setState({ native: await screenTime.getState().catch(() => ({ ...state.native, shieldActive: false, overriddenUntil: current.endsAt })) });
    return true;
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    save,
    remove,
    sync,
    refreshAuthorization,
    requestAuthorization,
    pickApps: (current: string | null) => screenTime.pickApps(current),
    restriction,
    endTonight,
  };
}

export type NightStore = ReturnType<typeof createNightStore>;

/** Subscribes a component to the store and loads the routine on first use. */
export function useNightStore(store: NightStore) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => {
    if (store.getState().status === 'idle') store.load();
  }, [store]);
  return state;
}
