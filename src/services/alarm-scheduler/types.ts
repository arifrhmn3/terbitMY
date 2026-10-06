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
  | { status: 'scheduled' }
  | { status: 'not-implemented' }
  | { status: 'permission-denied' }
  | { status: 'failed'; message: string };

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
}
