import type { NativeAlarmAction, NativeRecordPayload } from '../../../modules/terbit-alarms';

import type { AlarmBackend, AlarmFiredEvent, AlarmSpec, SnoozeRing } from './types';

/** iOS AlarmKit states that mean the alarm is still registered with the system. */
const ALARMKIT_LIVE = ['scheduled', 'alerting', 'countdown', 'paused'];

type Schedule = { hour: number; minute: number; weekdays: number[]; fireAt: number | null };

/**
 * Every local time a schedule was due in (from, to]. Weekly: each selected
 * weekday (0 = Sunday) at hour:minute. One-off (no weekdays): `fireAt`.
 */
export function dueTimesBetween(schedule: Schedule, from: number, to: number): number[] {
  if (schedule.weekdays.length === 0) {
    return schedule.fireAt !== null && schedule.fireAt > from && schedule.fireAt <= to ? [schedule.fireAt] : [];
  }
  const due: number[] = [];
  const start = new Date(from);
  for (let offset = 0; ; offset++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), schedule.hour, schedule.minute).getTime();
    if (day.getTime() > to) break;
    if (at > from && at <= to && schedule.weekdays.includes(day.getDay())) due.push(at);
  }
  return due;
}

const isSaved = (r: NativeRecordPayload) => r.kind === 'saved';

function uniqueSorted(events: AlarmFiredEvent[]): AlarmFiredEvent[] {
  const seen = new Set<string>();
  return events
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .filter((e) => {
      const key = `${e.alarmId}@${e.scheduledAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Android: the receiver records each fire (and how it was stopped), so these are confirmed by the system. */
export function androidFireEvents(records: NativeRecordPayload[], since: number): AlarmFiredEvent[] {
  return uniqueSorted(
    records
      .filter((r) => isSaved(r) && r.firedAt !== null && r.fireAt >= since)
      .map((r) => ({
        alarmId: r.alarmId,
        scheduledAt: r.fireAt,
        firedAt: r.firedAt,
        evidence: 'system' as const,
        stoppedAt: r.stoppedAt,
        stopAction: r.stopAction ?? null,
      })),
  );
}

/**
 * An AlarmKit button tap belongs to the alarm that was due up to this long
 * before it. It covers the longest snooze sequence (5 × 15 min) with room to spare.
 */
export const ACTION_MATCH_WINDOW_MS = 120 * 60 * 1000;

/** Snooze taps confirm the alarm rang but never stop the morning. */
const isSnoozeAction = (a: NativeAlarmAction) => a.action === 'snooze' || a.action === 'snooze_failed';

/**
 * iOS: AlarmKit doesn't tell apps when an alarm fires, so the due times of
 * each registered alarm are worked out from its schedule ('schedule'
 * evidence), only for the period it was actually registered. A tap on the
 * alarm's buttons (recorded by Terbit MY's App Intents) confirms the fire
 * ('system' evidence) and says how it was stopped: 'mission' for
 * "Stop & Open Terbit" / "Stop & Start Mission", 'stop' for the system Stop.
 */
export function alarmKitFireEvents(
  records: NativeRecordPayload[],
  since: number,
  now: number,
  actions: NativeAlarmAction[] = [],
): AlarmFiredEvent[] {
  const events: AlarmFiredEvent[] = [];
  for (const r of records) {
    if (!isSaved(r) || r.hour == null || r.minute == null) continue;
    const from = Math.max(since, r.createdAt);
    const to = Math.min(now, r.cancelledAt ?? now);
    const schedule = { hour: r.hour, minute: r.minute, weekdays: r.weekdays ?? [], fireAt: r.fireAt };
    for (const due of dueTimesBetween(schedule, from, to)) {
      // Taps on this morning's rings: the alarm's own, and its snooze rings (same alarmId).
      const taps = actions
        .filter((a) => (a.nativeId === r.nativeId || a.alarmId === r.alarmId) && a.at >= due && a.at < due + ACTION_MATCH_WINDOW_MS)
        .sort((a, b) => a.at - b.at);
      // The first Stop / Stop & Open Terbit ends the ringing; Snooze taps never do.
      const stop = taps.find((a) => !isSnoozeAction(a));
      if (stop && (stop.action === 'mission' || stop.action === 'stop')) {
        events.push({ alarmId: r.alarmId, scheduledAt: due, firedAt: due, evidence: 'system', stoppedAt: stop.at, stopAction: stop.action });
      } else if (taps.length > 0) {
        // Snoozed (still ringing on and off): confirmed, not stopped.
        events.push({ alarmId: r.alarmId, scheduledAt: due, firedAt: due, evidence: 'system', stoppedAt: null, stopAction: null });
      } else {
        events.push({ alarmId: r.alarmId, scheduledAt: due, firedAt: due, evidence: 'schedule', stoppedAt: null, stopAction: null });
      }
    }
  }
  return uniqueSorted(events);
}

const sameDays = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join();
const sameOffsets = (a: readonly number[], b: readonly number[]) => a.join() === b.join();

/**
 * iOS snooze rings from the native records. Each belongs to ONE morning of a
 * saved alarm (`originAt`); it's pending until it rings or is cancelled.
 */
export function snoozeRings(records: NativeRecordPayload[]): SnoozeRing[] {
  return records
    .filter((r) => r.kind === 'snooze' && r.snoozeIndex != null && r.originAt != null)
    .map((r) => ({
      alarmId: r.alarmId,
      nativeId: r.nativeId,
      index: r.snoozeIndex!,
      total: r.snoozeOffsets?.length ?? r.snoozeIndex!,
      originAt: r.originAt!,
      fireAt: r.fireAt,
      pending: r.cancelledAt === null && r.state === 'scheduled',
    }));
}

/** Is this saved alarm already scheduled natively exactly as `spec` asks? */
export function isNativeUpToDate(records: NativeRecordPayload[], spec: AlarmSpec, backend: AlarmBackend): boolean {
  return records.some((r) => {
    if (!isSaved(r) || r.alarmId !== spec.id || r.cancelledAt !== null) return false;
    if (backend === 'alarm-manager') {
      return r.state === 'scheduled' && r.firedAt === null && r.fireAt === spec.nextFireAt;
    }
    return (
      ALARMKIT_LIVE.includes(r.state) &&
      // Mode and button label are part of the AlarmKit alert, so a change (or an alarm
      // created by an earlier build without the button) needs a new AlarmKit alarm.
      r.completionMode === spec.completionMode &&
      r.actionLabel === spec.actionLabel &&
      r.hour === spec.hour &&
      r.minute === spec.minute &&
      sameDays(r.weekdays ?? [], spec.weekdays) &&
      // Snooze rings come from the alarm's own record, so a snooze change needs a new AlarmKit alarm.
      sameOffsets(r.snoozeOffsets ?? [], spec.snoozeOffsetsMinutes) &&
      (spec.weekdays.length > 0 || r.fireAt === spec.nextFireAt)
    );
  });
}

/**
 * Saved alarms that still have a *future* native alarm but are no longer
 * enabled. Alarms that already went off are left alone, so cancelling never
 * silences an alarm that is ringing right now.
 */
export function staleSavedAlarmIds(records: NativeRecordPayload[], enabledIds: Set<string>): string[] {
  const stale = records.filter(
    (r) => isSaved(r) && !enabledIds.has(r.alarmId) && r.cancelledAt === null && r.state === 'scheduled',
  );
  return [...new Set(stale.map((r) => r.alarmId))];
}
