import type { MobilityProfile } from '@/features/missions/fitness/types';

import { sortAlarms, type Alarm, type AlarmMission } from './alarm';

export type ManageGroupId = 'education' | 'fitness' | 'faith' | 'none';
export type ManageGroup = { id: ManageGroupId; title: string; alarms: Alarm[] };

const ORDER: readonly ManageGroupId[] = ['education', 'fitness', 'faith', 'none'];

export function manageGroupOf(mission: AlarmMission): ManageGroupId {
  switch (mission.type) {
    case 'math':
    case 'quiz':
      return 'education';
    case 'fitness':
      return 'fitness';
    case 'recitation':
    case 'reflection':
    case 'recitation_reflection':
      return 'faith';
    case 'none':
      return 'none';
  }
}

/**
 * Manage alarms: grouped by mission category (Education, Fitness — "Wake-up
 * activity" for the Non-physical profile — Faith, No mission), then by time
 * within each group. Every alarm appears exactly once, on or off.
 */
export function groupAlarmsForManage(alarms: readonly Alarm[], profile: MobilityProfile): ManageGroup[] {
  const title: Record<ManageGroupId, string> = {
    education: 'Education',
    fitness: profile === 'non_physical' ? 'Wake-up activity' : 'Fitness',
    faith: 'Faith',
    none: 'No mission',
  };
  return ORDER.map((id) => ({ id, title: title[id], alarms: sortAlarms(alarms.filter((a) => manageGroupOf(a.mission) === id)) })).filter(
    (g) => g.alarms.length > 0,
  );
}
