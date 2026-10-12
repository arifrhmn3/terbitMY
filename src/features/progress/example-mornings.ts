import { createAlarmDraft, type Alarm, type AlarmMission, type CompletionMode } from '@/features/alarms/alarm';
import {
  cancelOccurrence,
  completeMission,
  completeWithoutMission,
  createOccurrence,
  dismissOccurrence,
  markAlarmFired,
  markMissed,
  startMission,
  type AlarmOccurrence,
  type OccurrenceSource,
  type TransitionResult,
} from '@/features/alarms/occurrence';
import type { RecitationMissionResult } from '@/features/faith/recitation/types';
import type { ReflectionMissionResult } from '@/features/faith/reflection/types';
import type { FaithTradition } from '@/features/faith/types';
import { EXERCISES, fitnessTarget } from '@/features/missions/fitness/exercises';
import type { MissionDifficulty, MissionResult } from '@/features/missions/types';

export type MorningOutcome = 'completed' | 'missed' | 'dismissed' | 'cancelled' | 'open' | 'turned_off';

const MINUTE = 60_000;

function exampleRecitation(tradition: FaithTradition): RecitationMissionResult {
  return {
    type: 'recitation',
    tradition,
    date: '2026-10-01',
    assignmentId: `daily-${tradition}-2026-10-01`,
    provider: 'dev-remote',
    contentId: `${tradition}-sample-a`,
    reference: 'Sample passage A (development sample, not scripture)',
    sectionCount: 12,
    durationMs: 600_000,
    usedFallback: false,
    verification: 'self_reported',
  };
}

function exampleReflection(difficulty: MissionDifficulty): ReflectionMissionResult {
  return {
    type: 'reflection',
    difficulty,
    date: '2026-10-01',
    theme: 'gratitude',
    promptSetId: 'gratitude-1',
    trackId: 'reflection-001',
    trackTitle: 'Still Water',
    musicSource: 'cache',
    targetMs: 45_000,
    durationMs: 45_000,
  };
}

function step(result: TransitionResult): AlarmOccurrence {
  if (!result.ok) throw new Error(`Example morning: ${result.error}`);
  return result.occurrence;
}

/**
 * Builds a finished (or still open) morning through the real occurrence
 * transitions, as if it had happened at `scheduledAt`. Used by the
 * developer seed and by tests.
 */
export function buildMorning(params: {
  id: string;
  scheduledAt: number;
  outcome: MorningOutcome;
  alarmId?: string;
  mode?: CompletionMode;
  mission?: AlarmMission;
  source?: OccurrenceSource;
  label?: string;
  /** Was it the Main Wake-Up Alarm when it fired? Default true (a "morning"). */
  mainWakeUp?: boolean;
}): AlarmOccurrence {
  const { id, scheduledAt, outcome, mode = 'reward', source = 'simulated' } = params;
  const mission: AlarmMission = params.mission ?? { type: 'math', difficulty: 'easy', questionCount: 3 };
  const alarm: Alarm = {
    ...createAlarmDraft({ completionMode: mode, mission, label: params.label ?? '', isPrimary: params.mainWakeUp ?? true }),
    id: params.alarmId ?? `alarm-${id}`,
    createdAt: scheduledAt,
    updatedAt: scheduledAt,
  };
  const created = createOccurrence({ alarm, scheduledAt, source, now: scheduledAt, id });
  if (outcome === 'cancelled') return step(cancelOccurrence(created, scheduledAt - MINUTE));

  const fired = step(markAlarmFired(created, scheduledAt));
  switch (outcome) {
    case 'open':
      return fired;
    case 'turned_off':
      return step(completeWithoutMission(fired, scheduledAt + MINUTE));
    case 'missed':
      return step(markMissed(fired, scheduledAt + 61 * MINUTE));
    case 'dismissed':
      return step(dismissOccurrence(fired, scheduledAt + 2 * MINUTE));
    case 'completed': {
      const started = step(startMission(fired, scheduledAt + MINUTE));
      const result: MissionResult =
        mission.type === 'quiz'
          ? {
              type: 'quiz',
              category: mission.category,
              difficulty: mission.difficulty,
              questionCount: mission.questionCount,
              correctCount: mission.questionCount - 1,
              accuracy: (mission.questionCount - 1) / mission.questionCount,
              durationMs: 90_000,
              answers: [],
            }
          : mission.type === 'fitness'
            ? {
                type: 'fitness',
                exercise: mission.exercise,
                difficulty: mission.difficulty,
                kind: EXERCISES[mission.exercise].kind,
                target: fitnessTarget(mission.exercise, mission.difficulty),
                achieved: fitnessTarget(mission.exercise, mission.difficulty),
                durationMs: 90_000,
                verification: 'self_reported',
                adaptation: 'standard',
              }
            : mission.type === 'recitation'
              ? exampleRecitation(mission.tradition)
              : mission.type === 'reflection'
                ? exampleReflection(mission.difficulty)
                : mission.type === 'recitation_reflection'
                  ? {
                      type: 'recitation_reflection',
                      tradition: mission.tradition,
                      difficulty: mission.difficulty,
                      recitation: exampleRecitation(mission.tradition),
                      reflection: exampleReflection(mission.difficulty),
                      durationMs: 645_000,
                    }
                  : { difficulty: 'easy', questionCount: 3, attempts: 3, wrongAttempts: 0, accuracy: 1, durationMs: 90_000 };
      return step(completeMission(started, result, scheduledAt + 4 * MINUTE));
    }
  }
}

/**
 * DEVELOPER SEED: a week of example mornings ending yesterday, at 06:30 local
 * time. One missed morning, then five successful ones in a row (one in
 * Challenge, one in Gentle), so streaks, XP and achievements all show data.
 */
export function exampleWeek(now: number): AlarmOccurrence[] {
  const today = new Date(now);
  const at = (daysAgo: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, 6, 30).getTime();
  const plan: { daysAgo: number; outcome: MorningOutcome; mode: CompletionMode }[] = [
    { daysAgo: 6, outcome: 'missed', mode: 'reward' },
    { daysAgo: 5, outcome: 'completed', mode: 'reward' },
    { daysAgo: 4, outcome: 'completed', mode: 'reward' },
    { daysAgo: 3, outcome: 'completed', mode: 'challenge' },
    { daysAgo: 2, outcome: 'completed', mode: 'gentle' },
    { daysAgo: 1, outcome: 'completed', mode: 'reward' },
  ];
  return plan.map(({ daysAgo, outcome, mode }) =>
    buildMorning({
      id: `seed_${at(daysAgo)}`,
      alarmId: 'dev-seed',
      label: 'Example morning',
      scheduledAt: at(daysAgo),
      outcome,
      mode,
    }),
  );
}
