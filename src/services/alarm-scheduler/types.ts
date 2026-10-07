/**
 * What the native layer needs to know to make an alarm ring. Kept separate
 * from the feature's `Alarm` type so services don't depend on feature code.
 */
export type AlarmSpec = {
  id: string;
  hour: number;
  minute: number;
  /** 0 is Sunday. Empty means ring once. */
  weekdays: number[];
  label: string;
  snoozeMinutes: number | null;
  /** True when the alarm has a mission (the phone's Stop control still works). */
  missionRequired: boolean;
  /** Text the system alarm shows. */
  title: string;
  /** The next time it should ring (ms since 1970). Native code repeats weekly alarms itself after that. */
  nextFireAt: number;
  completionMode: 'reward' | 'challenge' | 'gentle';
};

/** Which native system rings alarms on this device. */
export type AlarmBackend = 'none' | 'alarmkit' | 'notifications' | 'alarm-manager';

export type AlarmCapabilities = {
  /** `not-implemented` until the native alarm module exists for this platform. */
  status: 'not-implemented' | 'needs-permission' | 'ready';
  backend: AlarmBackend;
  ringsInSilentMode: boolean;
  /** One plain-language sentence for the UI. */
  summary: string;
};

export type AlarmPermission = 'granted' | 'denied' | 'not-implemented';

export type ScheduleResult =
  | { status: 'scheduled'; nativeId?: string }
  | { status: 'not-implemented' }
  | { status: 'permission-denied'; message?: string }
  | { status: 'failed'; message: string; code?: string };

/**
 * Whether this device can schedule native alarms (AlarmKit on iOS 26+,
 * AlarmManager on Android), with the permission detail the developer test
 * panel shows.
 */
export type NativeAlarmStatus = {
  /** False in Expo Go, on web, and on iOS older than 26. */
  available: boolean;
  backend: AlarmBackend;
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  /** Android: may the alarm open over the lock screen. Null where not applicable. */
  fullScreenAllowed: boolean | null;
  /** Plain-language explanation when something is missing. */
  detail: string | null;
};

export type OneTimeAlarmRequest = {
  /** Terbit MY alarm ID. Scheduling again with the same ID replaces the earlier native alarm. */
  alarmId: string;
  /** Terbit MY occurrence (or test) ID, carried through the native alarm. */
  occurrenceId: string | null;
  /** ms since 1970 */
  fireAt: number;
  title: string;
};

export type NativeAlarmRecord = {
  alarmId: string;
  occurrenceId: string | null;
  nativeId: string;
  fireAt: number;
  createdAt: number;
  /** As reported by the native side, e.g. 'scheduled', 'alerting', 'fired', 'stopped', 'cancelled', 'finished'. */
  state: string;
  firedAt: number | null;
  stoppedAt: number | null;
  cancelledAt: number | null;
};

/** A genuine native alarm that went off, as reported by `getFireEvents`. */
export type AlarmFiredEvent = {
  alarmId: string;
  /** When the alarm was due, in ms since 1970. With `alarmId` this identifies the event. */
  scheduledAt: number;
  /** When it actually went off, if the platform reports it. */
  firedAt?: number | null;
  /**
   * `system`: Android ran Terbit MY's code when it fired.
   * `schedule`: the AlarmKit alarm's time passed (iOS doesn't tell apps when an alarm fires).
   */
  evidence?: 'system' | 'schedule';
  /** Android: when the alarm screen / notification was used to stop it. */
  stoppedAt?: number | null;
  /** `stop`: stopped with the alarm controls. `mission`: "Start mission" was chosen. */
  stopAction?: 'stop' | 'mission' | null;
};

/**
 * The only way screens and features reach native alarm code. iOS (AlarmKit,
 * with a notification fallback) and Android (AlarmManager.setAlarmClock)
 * will each implement this interface; the UI does not change when they do.
 */
export interface AlarmService {
  getCapabilities(): Promise<AlarmCapabilities>;
  requestPermission(): Promise<AlarmPermission>;
  /** Schedules or reschedules one saved alarm with the operating system (repeats included). */
  schedule(alarm: AlarmSpec): Promise<ScheduleResult>;
  /** Cancels every native alarm for this Terbit MY alarm ID. */
  cancel(alarmId: string): Promise<void>;
  /**
   * Makes the native schedule match exactly these enabled alarms: schedules
   * missing or changed ones, cancels future native alarms for anything else.
   */
  syncAll(alarms: AlarmSpec[]): Promise<void>;
  /** Saved alarms that went off at or after `since` (ms since 1970), oldest first. */
  getFireEvents(since: number, now: number): Promise<AlarmFiredEvent[]>;

  // Native one-time alarms (milestone 1 proof of concept).
  getNativeAlarmStatus(): Promise<NativeAlarmStatus>;
  requestNativeAlarmPermission(): Promise<NativeAlarmStatus>;
  /** Schedules a real system alarm once. `cancel(alarmId)` removes it. */
  scheduleOneTime(request: OneTimeAlarmRequest): Promise<ScheduleResult>;
  /** Native alarms this app scheduled recently, newest first, with their native state. */
  listNativeAlarms(): Promise<NativeAlarmRecord[]>;
  /** Opens the system settings page for the missing alarm permission. */
  openNativeAlarmSettings(): Promise<void>;
}
