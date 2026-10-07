import { describeMission, formatAlarmTime } from './alarm';
import { isSuccessfulMorning, morningOutcome, OUTCOME_LABEL, STATUS_LABEL, type AlarmOccurrence } from './occurrence';

export type HistoryEntry = {
  id: string;
  /** e.g. "Tue, 6 Oct · 06:30" */
  scheduled: string;
  title: string;
  mission: string;
  /** The accountability outcome, e.g. "Completed", "Dismissed, no mission", "Mission abandoned". */
  status: string;
  /** True only for a completed mission, the one outcome that will count toward streaks. */
  successful: boolean;
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
  const outcome = morningOutcome(o);

  let completion: string | null = null;
  if (o.status === 'completed' && o.endedAt !== null) {
    completion = `Done at ${time(o.endedAt)}`;
    if (o.result?.kind === 'mission_completed') {
      const wrong = o.result.mission.wrongAttempts;
      completion += wrong === 0 ? ' · no wrong answers' : ` · ${wrong} wrong ${wrong === 1 ? 'answer' : 'answers'}`;
    }
  } else if (o.status === 'dismissed' && o.endedAt !== null) {
    completion = `Dismissed at ${time(o.endedAt)}`;
    if (o.result?.kind === 'system_dismiss') completion += ' with the phone’s alarm controls';
  }
  if (outcome === 'mission_abandoned' && o.missionStartedAt !== null) {
    completion = [completion, `mission started ${time(o.missionStartedAt)}`].filter(Boolean).join(' · ');
  }

  return {
    id: o.id,
    scheduled: `${day} · ${time(o.scheduledAt)}`,
    title: o.alarmLabel || 'Alarm',
    mission: describeMission(o.mission),
    status: outcome === 'in_progress' ? STATUS_LABEL[o.status] : OUTCOME_LABEL[outcome],
    successful: isSuccessfulMorning(o),
    completion,
    simulated: o.source === 'simulated',
  };
}
