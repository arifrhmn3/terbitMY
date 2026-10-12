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
  /** iOS diagnostics: alarms AlarmKit holds for this app, and how many Terbit MY doesn't track (left by earlier builds). */
  registeredAlarmCount?: number;
  untrackedAlarmCount?: number;
  /** iOS diagnostics: the alert presentation this iOS version uses. */
  presentation?: string;
};

export type OneTimeAlarmOptions = {
  alarmId: string;
  occurrenceId: string | null;
  /** When to ring, in ms since 1970. */
  fireAt: number;
  title: string;
};

/** A saved Terbit MY alarm. Native code repeats weekly alarms on its own. */
export type SavedAlarmOptions = {
  alarmId: string;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. Empty = ring once, at `fireAt`. */
  weekdays: number[];
  /** The next time it should ring (ms since 1970). */
  fireAt: number;
  title: string;
  /** True when the alarm has a mission (Android shows "Start mission"). */
  missionRequired: boolean;
  completionMode: 'reward' | 'challenge' | 'gentle';
  /** Label for the one-tap "stop and open the mission" button. */
  actionLabel: string;
  /** iOS: SF Symbol for that button. */
  actionIcon?: string;
};

/** iOS: a tap on the AlarmKit buttons, recorded natively by an App Intent. */
export type NativeAlarmAction = {
  alarmId: string;
  /** The AlarmKit alarm UUID. */
  nativeId: string;
  /** 'mission' = "Stop & Open Terbit" / "Stop & Start Mission". 'stop' = the system Stop button. */
  action: 'mission' | 'stop';
  /** ms since 1970 */
  at: number;
};

export type NativeScheduleResult =
  | { ok: true; nativeId: string }
  | { ok: false; code: NativeAlarmErrorCode; message: string };

export type NativeRecordPayload = {
  /** 'test' (developer test alarm) or 'saved' (a saved Terbit MY alarm). Older records have none (= test). */
  kind?: 'test' | 'saved';
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
  /** Android: 'stop' (alarm controls) or 'mission' ("Start mission"). */
  stopAction?: 'stop' | 'mission' | null;
  /** iOS saved alarms: the schedule AlarmKit was given. */
  hour?: number | null;
  minute?: number | null;
  weekdays?: number[] | null;
  /** iOS saved alarms: the mode the AlarmKit alarm was created with (decides its button label). */
  completionMode?: 'reward' | 'challenge' | 'gentle' | null;
  /** iOS: the Terbit button label it was created with (null = no button). */
  actionLabel?: string | null;
  /** iOS: which alert presentation was used (diagnostics). */
  presentation?: string | null;
};

export type TerbitAlarmsNativeModule = {
  getStatusAsync(): Promise<NativeStatusPayload>;
  requestPermissionAsync(): Promise<NativeStatusPayload>;
  /** Developer test: one alarm at a fixed time. */
  scheduleOneTimeAsync(options: OneTimeAlarmOptions): Promise<NativeScheduleResult>;
  /** A saved alarm (one-off or weekly). Replaces any earlier native alarm for the same ID. */
  scheduleAlarmAsync(options: SavedAlarmOptions): Promise<NativeScheduleResult>;
  /** Cancels every native alarm scheduled for `alarmId`. Returns how many were cancelled. */
  cancelAsync(alarmId: string): Promise<number>;
  /** The most recent native alarms this app scheduled, newest first. */
  listAsync(): Promise<NativeRecordPayload[]>;
  /** Opens the system settings page where the missing permission can be turned on. */
  openSettingsAsync(): Promise<void>;
  /** iOS only (developer tool): cancels every AlarmKit alarm of this app. Returns how many. */
  resetAllAsync?(): Promise<number>;
  /** iOS only: recent taps on the AlarmKit buttons, newest first. */
  listActionsAsync?(): Promise<NativeAlarmAction[]>;
  /** iOS: 'onAlarmAction' fires as soon as an App Intent has saved an AlarmKit button tap. */
  addListener?(eventName: 'onAlarmAction', listener: (action: NativeAlarmAction) => void): { remove(): void };
  /** iOS only: local notification reminders (Gentle mode). */
  requestReminderPermissionAsync?(): Promise<'granted' | 'denied'>;
  /** Reads the notification permission without asking. Missing in builds before Phase 3D. */
  getReminderPermissionAsync?(): Promise<'granted' | 'denied' | 'undetermined' | 'unknown'>;
  scheduleReminderAsync?(options: { id: string; title: string; body: string; fireAt: number }): Promise<boolean>;
  cancelReminderAsync?(id: string): Promise<void>;
};
