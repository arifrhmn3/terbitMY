/**
 * What Terbit MY can alert you about, in three kinds kept apart on purpose:
 * - alarm_critical: the alarm itself (AlarmKit). Never a preference.
 * - mission_reminder: part of an alarm's mode. Gentle follow-ups are what
 *   Gentle mode is, so they can't be switched off; Reward and Challenge
 *   alarms never send them. Choose the mode on the alarm instead.
 * - engagement: optional nudges. None are built yet. When the first one is,
 *   it becomes a user preference (off by default) stored with the app's other
 *   preferences (features/settings/preferences-store.ts).
 */
export type NotificationCategory = 'alarm_critical' | 'mission_reminder' | 'engagement';

export type NotificationId =
  | 'alarm'
  | 'gentleFollowUp'
  | 'morningReminders'
  | 'accountabilityNudges'
  | 'faithReminders'
  | 'circlesActivity';

export type NotificationDefinition = {
  id: NotificationId;
  category: NotificationCategory;
  title: string;
  description: string;
  /** automatic: always on where it applies (no switch). planned: not built yet. */
  status: 'automatic' | 'planned';
};

export const NOTIFICATIONS: readonly NotificationDefinition[] = [
  {
    id: 'alarm',
    category: 'alarm_critical',
    title: 'Alarms',
    description: 'Real iPhone alarms that ring even in silent mode or Focus. Nothing in Terbit MY’s notification settings can stop them.',
    status: 'automatic',
  },
  {
    id: 'gentleFollowUp',
    category: 'mission_reminder',
    title: 'Gentle mode follow-ups',
    description:
      'Part of Gentle mode: if a Gentle alarm’s mission isn’t done, a reminder arrives after the delay set on that alarm. Reward and Challenge alarms never send one.',
    status: 'automatic',
  },
  {
    id: 'morningReminders',
    category: 'engagement',
    title: 'Morning reminders',
    description: 'A nudge if your morning mission is still waiting.',
    status: 'planned',
  },
  {
    id: 'accountabilityNudges',
    category: 'engagement',
    title: 'Accountability nudges',
    description: 'Encouragement when your streak is at risk.',
    status: 'planned',
  },
  {
    id: 'faithReminders',
    category: 'engagement',
    title: 'Recitation and Reflection reminders',
    description: 'A reminder for today’s Faith practice.',
    status: 'planned',
  },
  {
    id: 'circlesActivity',
    category: 'engagement',
    title: 'Circles activity',
    description: 'Updates from people in your Circles.',
    status: 'planned',
  },
];
