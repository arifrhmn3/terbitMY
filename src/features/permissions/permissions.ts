import type { NativeAlarmStatus } from '@/services/alarm-scheduler';
import type { ReminderPermission } from '@/services/notifications';

/**
 * What the Permissions screen shows. Statuses come only from what the
 * platform actually reports: when it can't tell, the status is 'unknown',
 * never 'granted'.
 */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'not_determined'
  | 'unknown'
  | 'unavailable'
  /** Works without any permission (audio playback). */
  | 'not_needed'
  /** Terbit MY doesn't use it and never asks (microphone, camera). */
  | 'not_used';

export type PermissionId = 'alarms' | 'notifications' | 'audio' | 'microphone' | 'camera';

export const PERMISSION_ORDER: readonly PermissionId[] = ['alarms', 'notifications', 'audio', 'microphone', 'camera'];

export type PermissionInfo = {
  title: string;
  /** Why Terbit MY needs it (or why it doesn't). */
  why: string;
  /** When Terbit MY asks for it. */
  asked: string;
};

export const PERMISSION_INFO: Record<PermissionId, PermissionInfo> = {
  alarms: {
    title: 'Alarms',
    why: 'Lets your alarms ring as real iPhone alarms, even in silent mode or with Focus on.',
    asked: 'Asked the first time you save an alarm.',
  },
  notifications: {
    title: 'Notifications',
    why: 'Used for Gentle mode follow-up reminders when a mission isn’t done. Alarms don’t depend on it.',
    asked: 'Asked when you save a Gentle alarm.',
  },
  audio: {
    title: 'Audio playback',
    why: 'Reflection music plays even with the silent switch on and pauses other audio while you reflect. No permission is needed.',
    asked: 'Never asked.',
  },
  microphone: {
    title: 'Microphone',
    why: 'Not used. Recitation is self-reported, so Terbit MY never listens.',
    asked: 'Never asked.',
  },
  camera: {
    title: 'Camera',
    why: 'Not used. Fitness missions are self-reported. Checking exercises with the camera may come later, and would only be asked for if you choose it.',
    asked: 'Never asked.',
  },
};

export const STATUS_LABEL: Record<PermissionStatus, string> = {
  granted: 'Allowed',
  denied: 'Not allowed',
  not_determined: 'Not asked yet',
  unknown: 'Can’t check on this version',
  unavailable: 'Not available on this phone',
  not_needed: 'No permission needed',
  not_used: 'Not used',
};

export function alarmPermissionStatus(permission: NativeAlarmStatus['permission']): PermissionStatus {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'not_determined';
    default:
      return 'unavailable';
  }
}

export function notificationPermissionStatus(permission: ReminderPermission): PermissionStatus {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'not_determined';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

/** What the screen offers: ask (only if never asked), open iPhone Settings, or nothing. */
export type PermissionAction = 'request' | 'open_settings' | null;

export function permissionAction(id: PermissionId, status: PermissionStatus): PermissionAction {
  if (id === 'audio' || id === 'microphone' || id === 'camera') return null; // never requested
  if (status === 'not_determined') return 'request';
  if (status === 'granted' || status === 'denied' || status === 'unknown') return 'open_settings';
  return null;
}

/** The statuses for every row, from what the platform reported. */
export function permissionStatuses(reported: {
  alarms: NativeAlarmStatus['permission'];
  notifications: ReminderPermission;
}): Record<PermissionId, PermissionStatus> {
  return {
    alarms: alarmPermissionStatus(reported.alarms),
    notifications: notificationPermissionStatus(reported.notifications),
    audio: 'not_needed',
    microphone: 'not_used',
    camera: 'not_used',
  };
}
