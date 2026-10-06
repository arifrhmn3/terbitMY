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
  /** True when a mission must be completed before the alarm can be dismissed. */
  missionRequired: boolean;
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
 * Whether this device can schedule a one-time native alarm (milestone 1:
 * AlarmKit on iOS 26+, AlarmManager on Android). Separate from
 * `AlarmCapabilities`, which covers the user's saved repeating alarms and
 * stays `not-implemented` until those ring natively.
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

/** Sent by native code when a real system alarm goes off. */
export type AlarmFiredEvent = {
  alarmId: string;
  /** When the alarm was due, in ms since 1970. */
  scheduledAt: number;
};

/**
 * The only way screens and features reach native alarm code. iOS (AlarmKit,
 * with a notification fallback) and Android (AlarmManager.setAlarmClock)
 * will each implement this interface; the UI does not change when they do.
 */
export interface AlarmService {
  getCapabilities(): Promise<AlarmCapabilities>;
  requestPermission(): Promise<AlarmPermission>;
  /** Schedules or reschedules one alarm with the operating system. */
  schedule(alarm: AlarmSpec): Promise<ScheduleResult>;
  cancel(alarmId: string): Promise<void>;
  /** The alarm that launched the app from closed, if any. Read once at startup. */
  getLaunchEvent(): Promise<AlarmFiredEvent | null>;
  /** Called when an alarm fires while the app is running. Returns an unsubscribe function. */
  addFiredListener(listener: (event: AlarmFiredEvent) => void): () => void;

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
