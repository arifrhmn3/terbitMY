import { evaluateMorning, MODE_POLICIES } from './accountability';
import { describeMission, formatAlarmTime } from './alarm';
import type { AlarmOccurrence } from './occurrence';

export type HistoryEntry = {
  id: string;
  /** e.g. "Tue, 6 Oct · 06:30" */
  scheduled: string;
  title: string;
  /** e.g. "Maths · Easy · 3 questions · Reward mode" */
  mission: string;
  /** Plain-language outcome, e.g. "Mission completed", "Stopped with phone controls · Mission not done". */
  status: string;
  /** Qualifies for a streak day under the alarm's mode (Phase 2 will use this). */
  successful: boolean;
  /** e.g. "Done at 06:32 · 1 wrong answer", or null. */
  completion: string | null;
  /** How Terbit MY knows the alarm went off. */
  source: string;
};

function time(ms: number) {
  const date = new Date(ms);
  return formatAlarmTime({ hour: date.getHours(), minute: date.getMinutes() });
}

const SOURCE_TEXT = {
  app: 'Simulated in Terbit MY',
  system: 'Real alarm (reported by Android)',
  schedule: 'Real alarm (AlarmKit schedule)',
} as const;

/** Turns an occurrence into the text shown in "Recent mornings". */
export function toHistoryEntry(o: AlarmOccurrence): HistoryEntry {
  const day = new Date(o.scheduledAt).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const evaluation = evaluateMorning(o);

  const details: string[] = [];
  if (o.alarmStopReason === 'system' && o.alarmStoppedAt !== null) {
    details.push(`Alarm stopped with phone controls at ${time(o.alarmStoppedAt)}`);
  }
  if (o.missionStartedAt !== null && evaluation.missionOutcome !== 'completed') {
    details.push(`mission started ${time(o.missionStartedAt)}`);
  }
  if (o.status === 'completed' && o.endedAt !== null) {
    let done = `Done at ${time(o.endedAt)}`;
    if (o.result?.kind === 'mission_completed') {
      const wrong = o.result.mission.wrongAttempts;
      done += wrong === 0 ? ' · no wrong answers' : ` · ${wrong} wrong ${wrong === 1 ? 'answer' : 'answers'}`;
    }
    details.push(done);
  } else if (o.status === 'dismissed' && o.result?.kind === 'emergency_dismiss' && o.endedAt !== null) {
    details.push(`Ended in Terbit MY at ${time(o.endedAt)}`);
  }

  return {
    id: o.id,
    scheduled: `${day} · ${time(o.scheduledAt)}`,
    title: o.alarmLabel || 'Alarm',
    mission: `${describeMission(o.mission)} · ${MODE_POLICIES[o.completionMode].label} mode`,
    status: evaluation.summary,
    successful: evaluation.streakEligible,
    completion: details.length > 0 ? details.join(' · ') : null,
    source: SOURCE_TEXT[o.fireEvidence],
  };
}
