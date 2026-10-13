import { evaluateMorning } from '@/features/alarms/accountability';
import type { Alarm, AlarmMission, CompletionMode, SnoozePreference } from '@/features/alarms/alarm';
import { canResumeMission, missionResumeState } from '@/features/alarms/completion-policy';
import { mainWakeUpIdForDate, nextRingAt, ringsOnDate } from '@/features/alarms/main-wake-up';
import { isOneOff } from '@/features/alarms/morning';
import type { AlarmOccurrence } from '@/features/alarms/occurrence';
import { localDayKey, type DayKeyFn } from '@/features/progress/day';

/**
 * Today, the user's daily home: today's ACTIVE alarms (in time order), what's
 * next, and how this morning is going. Pure.
 *
 * Two kinds of data, kept apart on purpose:
 * - SAVED ALARMS (configuration) decide which rows exist: every saved, turned-on
 *   alarm that rings today. A deleted or turned-off alarm has no row, even if it
 *   rang earlier today (its morning stays in Progress).
 * - OCCURRENCES (what happened this morning) only add state to a row: rang,
 *   mission waiting, completed, not completed. History screens use the
 *   occurrence snapshots instead (`progress/history`).
 * The Main Wake-Up tag always comes from `resolvedMainWakeUp` for today's date.
 */
export type TodayItemStatus =
  /** Later today. */
  | 'upcoming'
  /** Rang; the mission is still waiting and can be finished. */
  | 'in_progress'
  | 'completed'
  | 'missed'
  /** Ended without the mission (skipped / given up / stopped / its window closed). */
  | 'not_completed'
  /** The time has passed and nothing was recorded on this phone. */
  | 'passed';

/** What tapping a row on Today (or the Main Wake-Up card) does. */
export type TodayAlarmAction =
  | { kind: 'resume_mission'; occurrenceId: string }
  | { kind: 'edit_alarm'; alarmId: string }
  | { kind: 'none' };

export type TodayItem = {
  key: string;
  /** The saved alarm this row is for. */
  alarmId: string;
  /** Today's morning for this alarm, if it has rung. */
  occurrenceId: string | null;
  hour: number;
  minute: number;
  label: string;
  mission: AlarmMission;
  mode: CompletionMode;
  isMainWakeUp: boolean;
  /** A one-time alarm: rings once, then turns itself off. Today tags it "One-off". */
  oneOff: boolean;
  /** Snoozes belong to this one item (never separate rows). Null when snooze is off. */
  snooze: SnoozePreference | null;
  /** This morning was snoozed and rings again then (ms), or null. */
  snoozedUntil: number | null;
  status: TodayItemStatus;
  action: TodayAlarmAction;
};

/** A snooze ring still to come (from the native alarm), for the morning that started at `originAt`. */
export type PendingSnooze = { alarmId: string; originAt: number; fireAt: number };

export type MorningStatus =
  /** No alarm is marked as the Main Wake-Up Alarm. */
  | { kind: 'no_main' }
  /** No Main Wake-Up applies today. */
  | { kind: 'not_today'; nextAt: number | null }
  | { kind: 'ahead'; hour: number; minute: number }
  | { kind: 'in_progress'; occurrenceId: string }
  | { kind: 'complete' }
  | { kind: 'not_complete'; summary: string };

export type TodayPlan = {
  schedule: TodayItem[];
  /** The next time any active alarm rings (today or later), or null. */
  next: { alarmId: string; at: number } | null;
  morning: MorningStatus;
};

/**
 * THE Today row rule. Resume the mission only when this morning rang, the
 * saved alarm still exists, it has a mission, the mission isn't done and its
 * completion window (`completion-policy.ts`) is still open. Everything else
 * (upcoming, completed, expired, no mission) opens the saved alarm.
 */
export function todayAlarmAction(alarm: Pick<Alarm, 'id'> | null, occurrence: AlarmOccurrence | null, now: number): TodayAlarmAction {
  if (!alarm) return { kind: 'none' };
  if (occurrence && occurrence.alarmId === alarm.id && canResumeMission(occurrence, now)) {
    return { kind: 'resume_mission', occurrenceId: occurrence.id };
  }
  return { kind: 'edit_alarm', alarmId: alarm.id };
}

function statusOf(o: AlarmOccurrence, now: number): TodayItemStatus {
  switch (missionResumeState(o, now)) {
    case 'resumable':
      return 'in_progress';
    case 'not_rung':
      return 'upcoming';
    case 'no_mission':
      return 'passed';
    case 'completed':
      return evaluateMorning(o).morningComplete ? 'completed' : 'not_completed';
    case 'expired':
      return o.status === 'missed' ? 'missed' : 'not_completed';
  }
}

const sameClock = (o: AlarmOccurrence, a: Alarm) => {
  const t = new Date(o.scheduledAt);
  return t.getHours() === a.hour && t.getMinutes() === a.minute;
};

export function buildToday(params: {
  alarms: readonly Alarm[];
  /** Mornings recorded on this phone (any range; only today's are used). */
  occurrences: readonly AlarmOccurrence[];
  /** Snooze rings still to come; shown on their morning's row, never as rows of their own. */
  pendingSnoozes?: readonly PendingSnooze[];
  now: number;
  dayKey?: DayKeyFn;
}): TodayPlan {
  const { alarms, now, dayKey = localDayKey } = params;
  const today = dayKey(now);
  const todays = params.occurrences
    .filter((o) => o.status !== 'cancelled' && dayKey(o.scheduledAt) === today)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);
  const mainId = mainWakeUpIdForDate(alarms, now, todays);

  const items: TodayItem[] = [];
  for (const alarm of alarms) {
    const mine = todays.filter((o) => o.alarmId === alarm.id);
    // A mission still waiting wins (even if the alarm's time was edited since it rang).
    const occurrence = mine.find((o) => canResumeMission(o, now)) ?? mine.find((o) => sameClock(o, alarm)) ?? null;
    const active = alarm.enabled && ringsOnDate(alarm, now);
    // A one-off turns itself off after ringing; it stays on Today only while its mission can be finished.
    const waitingOneOff = isOneOff(alarm) && occurrence !== null && canResumeMission(occurrence, now);
    if (!active && !waitingOneOff) continue;

    const time = occurrence ? new Date(occurrence.scheduledAt) : null;
    const hour = time?.getHours() ?? alarm.hour;
    const minute = time?.getMinutes() ?? alarm.minute;
    const at = new Date(new Date(now).setHours(hour, minute, 0, 0)).getTime();
    const status = occurrence ? statusOf(occurrence, now) : at > now ? 'upcoming' : 'passed';
    items.push({
      key: `${alarm.id}-${today}`,
      alarmId: alarm.id,
      occurrenceId: occurrence?.id ?? null,
      hour,
      minute,
      label: alarm.label,
      // A morning that rang keeps the mission it rang with.
      mission: occurrence?.mission ?? alarm.mission,
      mode: occurrence?.completionMode ?? alarm.completionMode,
      isMainWakeUp: alarm.id === mainId,
      oneOff: isOneOff(alarm),
      snooze: alarm.snooze.enabled ? alarm.snooze : null,
      snoozedUntil:
        status === 'in_progress' && occurrence
          ? (params.pendingSnoozes?.find((p) => p.alarmId === alarm.id && p.originAt === occurrence.scheduledAt)?.fireAt ?? null)
          : null,
      status,
      action: todayAlarmAction(alarm, occurrence, now),
    });
  }
  items.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute) || a.key.localeCompare(b.key));

  // Next alarm: deleted, turned-off and already-rung one-off alarms never count.
  let next: TodayPlan['next'] = null;
  for (const alarm of alarms) {
    const at = nextRingAt(alarm, now);
    if (at !== null && (next === null || at < next.at)) next = { alarmId: alarm.id, at };
  }

  return { schedule: items, next, morning: morningStatus(alarms, items, now) };
}

/** Only today's Main Wake-Up decides this morning (and the morning streak). */
function morningStatus(alarms: readonly Alarm[], items: TodayItem[], now: number): MorningStatus {
  const main = items.find((i) => i.isMainWakeUp);
  if (main) {
    switch (main.status) {
      case 'upcoming':
        return { kind: 'ahead', hour: main.hour, minute: main.minute };
      case 'in_progress':
        return main.action.kind === 'resume_mission'
          ? { kind: 'in_progress', occurrenceId: main.action.occurrenceId }
          : { kind: 'not_complete', summary: 'Mission not completed' };
      case 'completed':
        return { kind: 'complete' };
      case 'missed':
        return { kind: 'not_complete', summary: 'Missed' };
      case 'not_completed':
        return { kind: 'not_complete', summary: 'Mission not completed' };
      case 'passed':
        return { kind: 'not_complete', summary: 'No response recorded' };
    }
  }
  const mains = alarms.filter((a) => a.isPrimary);
  if (mains.length === 0) return { kind: 'no_main' };
  // No Main Wake-Up today: the next day that has one.
  const nexts = mains.map((a) => nextRingAt(a, now)).filter((t): t is number => t !== null);
  return { kind: 'not_today', nextAt: nexts.length > 0 ? Math.min(...nexts) : null };
}

/** XP earned today (by when it was earned), for the snapshot. */
export function xpToday(ledger: readonly { amount: number; earnedAt: number }[], now: number, dayKey: DayKeyFn = localDayKey): number {
  const today = dayKey(now);
  return ledger.filter((e) => dayKey(e.earnedAt) === today).reduce((sum, e) => sum + e.amount, 0);
}
