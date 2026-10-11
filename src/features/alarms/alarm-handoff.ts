import type { AlarmService } from '@/services/alarm-scheduler';

import { evaluateMorning } from './accountability';
import { planGentleReminders, type GentleReminder } from './gentle-reminders';
import type { AlarmStore } from './alarm-store';
import type { AlarmOccurrence } from './occurrence';
import type { OccurrenceManager } from './occurrence-manager';

/** How far back to look for native alarms that went off while Terbit MY was closed. */
export const FIRE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Connects genuine native alarms to Terbit MY's mornings. Run when the app
 * opens or comes back to the foreground (and from the Android "Start mission"
 * link):
 * 1. turn each native fire event into an occurrence (safe to repeat);
 * 2. turn off one-off alarms that have rung;
 * 3. make the native schedule match the saved alarms;
 * 4. return the morning that still needs attention, if any.
 */
export function createAlarmHandOff(deps: {
  alarmStore: AlarmStore;
  occurrences: OccurrenceManager;
  service: AlarmService;
  /** Local reminders for Gentle mode (optional: not every platform has them yet). */
  reminders?: { schedule(reminder: GentleReminder): Promise<unknown>; cancel(id: string): Promise<void> };
  /** Runs first, e.g. to load the entitlement so effective modes are right. */
  beforeSync?: () => Promise<void>;
  now?: () => number;
}) {
  const { alarmStore, occurrences, service, reminders, beforeSync, now = Date.now } = deps;
  let running: Promise<AlarmOccurrence | null> | null = null;
  let queued: Promise<AlarmOccurrence | null> | null = null;
  const listeners = new Set<(occurrence: AlarmOccurrence | null) => void>();

  async function processFireEvents() {
    await beforeSync?.();
    const at = now();
    const events = await service.getFireEvents(at - FIRE_LOOKBACK_MS, at);
    for (const event of events) {
      const saved = await alarmStore.find(event.alarmId);
      if (!saved) continue; // deleted since
      // The morning records the mode the alarm actually rang with (entitlement-adjusted).
      const occurrence = await occurrences.recordNativeFire(alarmStore.effective(saved), event);
      // "Stop & Open Terbit" / "Stop & Start Mission": go straight into the mission.
      if (event.stopAction === 'mission' && occurrence.status === 'alarm_fired' && occurrence.mission.type !== 'none') {
        await occurrences.startMission(occurrence.id).catch(() => {});
      }
      await alarmStore.disableAfterRinging(saved.id, event.firedAt ?? event.scheduledAt);
    }
  }

  /** Gentle mode: keep a local reminder scheduled exactly for open mornings whose follow-up is still ahead. */
  async function syncReminders() {
    if (!reminders) return;
    const plan = planGentleReminders(await occurrences.listRecent(30), now());
    for (const id of plan.cancel) await reminders.cancel(id);
    for (const reminder of plan.schedule) await reminders.schedule(reminder);
  }

  async function run(): Promise<AlarmOccurrence | null> {
    await processFireEvents();
    await alarmStore.syncNative();
    await syncReminders().catch(() => {});
    const open = (await occurrences.listActive()).filter((o) => o.source === 'native' && o.status !== 'scheduled');
    const result = open.sort((a, b) => b.scheduledAt - a.scheduledAt)[0] ?? null;
    for (const listener of listeners) listener(result);
    return result;
  }

  function sync(): Promise<AlarmOccurrence | null> {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
      return running;
    }
    // A call during a run may carry news that run already missed (e.g. an alarm
    // button tap saved after it read the taps), so queue one more run after it.
    // Every caller in the meantime shares that queued run.
    queued ??= running
      .catch(() => null)
      .then(() => {
        queued = null;
        return sync();
      });
    return queued;
  }

  return {
    /** Runs the hand-off one at a time; a call during a run gets a fresh run straight after it. */
    sync,
    /** Called after every run with the morning that needs attention. Returns an unsubscribe function. */
    subscribe(listener: (occurrence: AlarmOccurrence | null) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncReminders,
  };
}

export type AlarmHandOff = ReturnType<typeof createAlarmHandOff>;

/**
 * Show it if it hasn't been shown this session, if "Stop & Open Terbit" moved
 * it into the mission after it was last shown, or (Gentle mode) if its
 * follow-up became due after it was last shown.
 */
export function shouldPresent(occurrence: AlarmOccurrence, now: number, lastShown: number | undefined): boolean {
  if (lastShown === undefined) return true;
  if (occurrence.status === 'mission_in_progress' && (occurrence.missionStartedAt ?? 0) > lastShown) return true;
  const followUp = evaluateMorning(occurrence).followUpAt;
  return followUp !== null && now >= followUp && lastShown < followUp;
}

