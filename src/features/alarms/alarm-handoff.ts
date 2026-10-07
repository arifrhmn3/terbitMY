import type { AlarmService } from '@/services/alarm-scheduler';

import { evaluateMorning } from './accountability';
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
  now?: () => number;
}) {
  const { alarmStore, occurrences, service, now = Date.now } = deps;
  let running: Promise<AlarmOccurrence | null> | null = null;

  async function processFireEvents() {
    const at = now();
    const events = await service.getFireEvents(at - FIRE_LOOKBACK_MS, at);
    for (const event of events) {
      const alarm = await alarmStore.find(event.alarmId);
      if (!alarm) continue; // deleted since
      await occurrences.recordNativeFire(alarm, event);
      await alarmStore.disableAfterRinging(alarm.id, event.firedAt ?? event.scheduledAt);
    }
  }

  async function run(): Promise<AlarmOccurrence | null> {
    await processFireEvents();
    await alarmStore.syncNative();
    const open = (await occurrences.listActive()).filter((o) => o.source === 'native' && o.status !== 'scheduled');
    return open.sort((a, b) => b.scheduledAt - a.scheduledAt)[0] ?? null;
  }

  return {
    /** Runs the hand-off once at a time; concurrent callers share the same run. */
    sync(): Promise<AlarmOccurrence | null> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

export type AlarmHandOff = ReturnType<typeof createAlarmHandOff>;

/**
 * Show it if it hasn't been shown this session, or (Gentle mode) if its
 * follow-up became due after it was last shown.
 */
export function shouldPresent(occurrence: AlarmOccurrence, now: number, lastShown: number | undefined): boolean {
  if (lastShown === undefined) return true;
  const followUp = evaluateMorning(occurrence).followUpAt;
  return followUp !== null && now >= followUp && lastShown < followUp;
}

