import type { NativeAlarmStatus } from '@/services/alarm-scheduler';
import type { ReminderPermission } from '@/services/notifications';
import type { CameraPermission } from '@/services/pose';

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
  /** Terbit MY doesn't use it and never asks (microphone). */
  | 'not_used'
  /** The feature isn't in the installed build (an older or different build); not a phone limitation. */
  | 'not_in_build';

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
    why: 'Optional. Counts reps on this phone when you choose “Verify with camera” in a Fitness mission that offers it (push-ups, squats, jumping jacks, chair sit-to-stand). Video is not recorded, saved or uploaded. Tapping after each rep always works instead.',
    asked: 'Asked only the first time you choose “Verify with camera”.',
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
  not_in_build: 'Not in this build',
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

/** Camera: "Not asked yet" before iOS asks, never "unavailable"; a failed check is "unknown". */
export function cameraPermissionStatus(permission: CameraPermission): PermissionStatus {
  switch (permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'undetermined':
      return 'not_determined';
    case 'not_in_build':
      return 'not_in_build';
    case 'no_camera':
      return 'unavailable';
    case 'unknown':
      return 'unknown';
  }
}

export function permissionAction(id: PermissionId, status: PermissionStatus): PermissionAction {
  if (id === 'audio' || id === 'microphone') return null; // never requested
  // Camera: asked only from a Fitness mission ("Verify with camera"), never from Settings.
  if (id === 'camera') return status === 'granted' || status === 'denied' ? 'open_settings' : null;
  if (status === 'not_determined') return 'request';
  if (status === 'granted' || status === 'denied' || status === 'unknown') return 'open_settings';
  return null;
}

/** The statuses for every row, from what the platform reported. */
export function permissionStatuses(reported: {
  alarms: NativeAlarmStatus['permission'];
  notifications: ReminderPermission;
  camera?: CameraPermission;
}): Record<PermissionId, PermissionStatus> {
  return {
    alarms: alarmPermissionStatus(reported.alarms),
    notifications: notificationPermissionStatus(reported.notifications),
    audio: 'not_needed',
    microphone: 'not_used',
    camera: cameraPermissionStatus(reported.camera ?? 'not_in_build'),
  };
}
