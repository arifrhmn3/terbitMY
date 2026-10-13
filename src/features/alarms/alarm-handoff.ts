import type { AlarmService, SnoozeRing } from '@/services/alarm-scheduler';

import { evaluateMorning } from './accountability';
import type { Alarm, Weekday } from './alarm';
import { planGentleReminders, type GentleReminder } from './gentle-reminders';
import { mainWakeUpIdForDate } from './main-wake-up';
import { isOneOff } from './morning';
import type { AlarmStore } from './alarm-store';
import { isActive, type AlarmOccurrence } from './occurrence';
import type { OccurrenceManager } from './occurrence-manager';

/**
 * Whether a pending snooze ring should be cancelled. Viewing or starting the
 * mission is not a reason: only a finished morning, or an alarm that no
 * longer produces this ring (snooze off, its time changed, that weekday
 * removed, or it is no longer THAT DATE's Main Wake-Up, e.g. it was
 * replaced, or a one-off overrides that date). Snoozes belong to the
 * date's Main Wake-Up only, with that alarm's own snooze settings.
 */
export function snoozeNoLongerWanted(
  alarm: Alarm,
  ring: SnoozeRing,
  morning: AlarmOccurrence | null,
  alarms: readonly Alarm[] = [alarm],
): boolean {
  if (morning !== null && !isActive(morning)) return true;
  if (!alarm.isPrimary || !alarm.snooze.enabled) return true;
  const origin = new Date(ring.originAt);
  if (origin.getHours() !== alarm.hour || origin.getMinutes() !== alarm.minute) return true;
  if (alarm.weekdays.length > 0 && !alarm.weekdays.includes(origin.getDay() as Weekday)) return true;
  // A one-off owns its date; a repeating alarm only if no other alarm is that date's Main Wake-Up.
  return !isOneOff(alarm) && mainWakeUpIdForDate(alarms, ring.originAt, morning ? [morning] : []) !== alarm.id;
}

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
    // Snoozes so far for each morning, recorded first, so a snoozed morning isn't closed as overdue.
    const snoozes = await service.listSnoozes().catch(() => [] as SnoozeRing[]);
    await recordSnoozeCounts(snoozes);
    // Mornings already recorded in this window: a one-off Main Wake-Up that rang (and turned
    // itself off) still owns its date, so a later ring that day isn't recorded as a second one.
    const recorded = events.length > 0 ? await occurrences.listSince(at - 2 * FIRE_LOOKBACK_MS) : [];
    const rangOneOffs: { id: string; at: number }[] = [];
    for (const event of events) {
      const saved = await alarmStore.find(event.alarmId);
      if (!saved) continue; // deleted since
      // The morning records the mode the alarm actually rang with (entitlement-adjusted),
      // and whether this alarm was THAT DAY's Main Wake-Up (`resolvedMainWakeUp`: one per day).
      const mainId = mainWakeUpIdForDate(alarmStore.getState().alarms, event.scheduledAt, recorded);
      const forDay = { ...alarmStore.effective(saved), isPrimary: mainId === saved.id };
      const snoozeCount = Math.max(
        0,
        ...snoozes.filter((r) => r.alarmId === event.alarmId && r.originAt === event.scheduledAt).map((r) => r.index),
      );
      const occurrence = await occurrences.recordNativeFire(forDay, event, snoozeCount);
      recorded.push(occurrence);
      // "Stop & Open Terbit" / "Stop & Start Mission": go straight into the mission.
      if (event.stopAction === 'mission' && occurrence.status === 'alarm_fired' && occurrence.mission.type !== 'none') {
        await occurrences.startMission(occurrence.id).catch(() => {});
      }
      rangOneOffs.push({ id: saved.id, at: event.firedAt ?? event.scheduledAt });
    }
    // One-offs turn themselves off after ringing (after every event is recorded, so each
    // event above saw the same alarms).
    for (const { id, at: firedAt } of rangOneOffs) await alarmStore.disableAfterRinging(id, firedAt);
  }

  /** Gentle mode: keep a local reminder scheduled exactly for open mornings whose follow-up is still ahead. */
  async function syncReminders() {
    if (!reminders) return;
    const plan = planGentleReminders(await occurrences.listRecent(30), now());
    for (const id of plan.cancel) await reminders.cancel(id);
    for (const reminder of plan.schedule) await reminders.schedule(reminder);
  }

  /** The next snooze ring still to come, per alarm (for Today). */
  let pendingSnoozes = new Map<string, SnoozeRing>();

  /**
   * Snooze (iOS): every snooze ring belongs to ONE morning, the one at its
   * `originAt`. Records the snooze count on that morning; cancels rings that
   * are no longer wanted (the morning is finished, or the alarm was deleted or
   * is no longer the Main Wake-Up); remembers the next pending ring. Editing,
   * turning off or deleting an alarm already cancels its rings natively.
   */
  /** Records on each morning how many times it was snoozed (only ever goes up). */
  async function recordSnoozeCounts(rings: SnoozeRing[]) {
    const counts = new Map<string, { alarmId: string; originAt: number; count: number }>();
    for (const ring of rings) {
      const key = `${ring.alarmId}@${ring.originAt}`;
      const seen = counts.get(key);
      if (!seen || ring.index > seen.count) counts.set(key, { alarmId: ring.alarmId, originAt: ring.originAt, count: ring.index });
    }
    for (const { alarmId, originAt, count } of counts.values()) {
      const morning = await occurrences.findForEvent(alarmId, originAt);
      if (morning) await occurrences.recordSnoozes(morning.id, count).catch(() => {});
    }
  }

  async function syncSnoozes() {
    const rings = await service.listSnoozes();
    await recordSnoozeCounts(rings);

    const next = new Map<string, SnoozeRing>();
    for (const ring of rings.filter((r) => r.pending)) {
      const alarm = await alarmStore.find(ring.alarmId);
      const morning = await occurrences.findForEvent(ring.alarmId, ring.originAt);
      // Opening Terbit, seeing or starting the mission, switching tabs or leaving the app
      // never cancel a snooze. Only these do: the morning is finished (mission done, given
      // up, closed), or the alarm no longer matches this ring (deleted, snooze off, no
      // longer the Main Wake-Up, or its time or that day changed). Turning it off cancels natively.
      if (!alarm || snoozeNoLongerWanted(alarm, ring, morning, alarmStore.getState().alarms)) {
        await service.cancelSnoozes(ring.alarmId);
        continue;
      }
      const earlier = next.get(ring.alarmId);
      if (!earlier || ring.fireAt < earlier.fireAt) next.set(ring.alarmId, ring);
    }
    pendingSnoozes = next;
  }

  async function run(): Promise<AlarmOccurrence | null> {
    await processFireEvents();
    await alarmStore.syncNative();
    await syncReminders().catch(() => {});
    await syncSnoozes().catch(() => {});
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
    syncSnoozes,
    /** The next snooze ring still to come for each alarm, as of the last run. */
    pendingSnoozes(): ReadonlyMap<string, SnoozeRing> {
      return pendingSnoozes;
    },
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

