import { describeMission, formatAlarmTime } from './alarm';
import { STATUS_LABEL, type AlarmOccurrence } from './occurrence';

export type HistoryEntry = {
  id: string;
  /** e.g. "Tue, 6 Oct · 06:30" */
  scheduled: string;
  title: string;
  mission: string;
  status: string;
  /** e.g. "Done at 06:32 · 1 wrong answer", or null if it never finished properly. */
  completion: string | null;
  simulated: boolean;
};

function time(ms: number) {
  const date = new Date(ms);
  return formatAlarmTime({ hour: date.getHours(), minute: date.getMinutes() });
}

/** Turns an occurrence into the text shown in "Recent mornings". */
export function toHistoryEntry(o: AlarmOccurrence): HistoryEntry {
  const day = new Date(o.scheduledAt).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  let completion: string | null = null;
  if (o.status === 'completed' && o.endedAt !== null) {
    completion = `Done at ${time(o.endedAt)}`;
    if (o.result?.kind === 'mission_completed') {
      const wrong = o.result.mission.wrongAttempts;
      completion += wrong === 0 ? ' · no wrong answers' : ` · ${wrong} wrong ${wrong === 1 ? 'answer' : 'answers'}`;
    }
  } else if (o.status === 'dismissed' && o.endedAt !== null) {
    completion = `Dismissed at ${time(o.endedAt)}`;
  }

  return {
    id: o.id,
    scheduled: `${day} · ${time(o.scheduledAt)}`,
    title: o.alarmLabel || 'Alarm',
    mission: describeMission(o.mission),
    status: STATUS_LABEL[o.status],
    completion,
    simulated: o.source === 'simulated',
  };
}
