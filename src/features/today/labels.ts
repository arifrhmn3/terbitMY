import { missionForProfile } from '@/features/accessibility/accessibility-settings';
import { COMPLETION_MODE_LABEL, describeMission, describeSnooze, type AlarmMission, type CompletionMode, type SnoozePreference } from '@/features/alarms/alarm';
import { MAIN_WAKE_UP_TAG, ONE_OFF_TAG } from '@/features/alarms/main-wake-up';
import type { MobilityProfile } from '@/features/missions/fitness/types';

import type { TodayItemStatus } from './today';

/** The words Today uses for a row's state (one place, so every screen says the same). */
export const TODAY_STATUS_LABEL: Record<TodayItemStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'Mission waiting · tap to finish',
  completed: 'Completed',
  missed: 'Missed',
  not_completed: 'Not completed',
  passed: 'Earlier today',
};

/** "Main Wake-Up · Subuh · Maths · Easy · Reward · Up to 3 snoozes · 10 min" style summary for a schedule row. */
export function describeScheduleItem(
  item: {
    isMainWakeUp: boolean;
    oneOff: boolean;
    label: string;
    mission: AlarmMission;
    mode: CompletionMode;
    snooze?: SnoozePreference | null;
  },
  profile: MobilityProfile,
): string {
  const mission = item.mission.type === 'none' ? 'No mission' : describeMission(missionForProfile(item.mission, profile));
  return [
    item.isMainWakeUp ? MAIN_WAKE_UP_TAG : null,
    item.oneOff ? ONE_OFF_TAG : null,
    item.label || null,
    mission,
    item.mission.type === 'none' ? null : COMPLETION_MODE_LABEL[item.mode],
    // Snoozes are part of this one alarm: summarised here, never listed as rows.
    item.snooze ? describeSnooze(item.snooze) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
