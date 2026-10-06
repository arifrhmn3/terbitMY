/**
 * The JavaScript shape of the native TerbitAlarms module. iOS (Swift,
 * AlarmKit) and Android (Kotlin, AlarmManager) implement the same functions.
 */

/** Error codes returned by `scheduleOneTimeAsync` on both platforms. */
export type NativeAlarmErrorCode =
  | 'unsupported_os' // iOS older than 26 (no AlarmKit)
  | 'not_authorized' // iOS: AlarmKit permission refused. Android: notifications off.
  | 'exact_alarm_not_allowed' // Android 12/12L: "Alarms & reminders" access off
  | 'time_in_past'
  | 'invalid_arguments'
  | 'scheduling_failed';

export type NativeStatusPayload = {
  /** False when this OS version can't schedule native alarms at all. */
  available: boolean;
  backend: 'alarmkit' | 'alarm-manager';
  permission: 'granted' | 'denied' | 'undetermined';
  osVersion: string;
  /** Android only. */
  notificationsAllowed?: boolean;
  /** Android only: AlarmManager.canScheduleExactAlarms(). */
  exactAlarmsAllowed?: boolean;
  /** Android only: may the alarm screen open over the lock screen (Android 14+ setting). */
  fullScreenAllowed?: boolean;
  /** Plain-language explanation when something is missing. */
  reason?: string;
};

export type OneTimeAlarmOptions = {
  alarmId: string;
  occurrenceId: string | null;
  /** When to ring, in ms since 1970. */
  fireAt: number;
  title: string;
};

export type NativeScheduleResult =
  | { ok: true; nativeId: string }
  | { ok: false; code: NativeAlarmErrorCode; message: string };

export type NativeRecordPayload = {
  alarmId: string;
  occurrenceId: string | null;
  nativeId: string;
  fireAt: number;
  createdAt: number;
  /**
   * iOS: 'scheduled' | 'alerting' | 'countdown' | 'paused' (from AlarmKit),
   * or 'cancelled' / 'finished' (no longer in AlarmKit's list after its time).
   * Android: 'scheduled' | 'fired' | 'stopped' | 'cancelled' | 'missing'.
   */
  state: string;
  firedAt: number | null;
  stoppedAt: number | null;
  cancelledAt: number | null;
};

export type TerbitAlarmsNativeModule = {
  getStatusAsync(): Promise<NativeStatusPayload>;
  requestPermissionAsync(): Promise<NativeStatusPayload>;
  scheduleOneTimeAsync(options: OneTimeAlarmOptions): Promise<NativeScheduleResult>;
  /** Cancels every native alarm scheduled for `alarmId`. Returns how many were cancelled. */
  cancelAsync(alarmId: string): Promise<number>;
  /** The most recent native alarms this app scheduled, newest first. */
  listAsync(): Promise<NativeRecordPayload[]>;
  /** Opens the system settings page where the missing permission can be turned on. */
  openSettingsAsync(): Promise<void>;
};
