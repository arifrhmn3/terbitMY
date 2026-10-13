/**
 * The native TerbitScreenTime module (iOS 16+): Apple's Screen Time
 * frameworks (FamilyControls, ManagedSettings, DeviceActivity). Everything
 * runs on the phone; Terbit MY never receives which apps were chosen or how
 * they're used.
 */
export type NativeAuthorizationStatus =
  /** This build doesn't include the Screen Time capability (awaiting Apple's approval). */
  | 'not_configured'
  /** iOS older than 16. */
  | 'unsupported'
  | 'not_determined'
  | 'approved'
  | 'denied';

export type NativeAuthorizationResult = { status: NativeAuthorizationStatus; error?: string };

export type NativeAppSelection = { token: string; applications: number; categories: number; webDomains: number };

export type NativeNightPlan = {
  selection: string | null;
  nights: { id: string; start: { weekday: number; hour: number; minute: number }; end: { weekday: number; hour: number; minute: number } }[];
  earlyEnds: { id: string; year: number; month: number; day: number; hour: number; minute: number }[];
  shieldNow: boolean;
  signature: string;
};

export type NativeScreenTimeState = {
  /** Restricted apps are shielded right now. */
  shieldActive: boolean;
  /** The user ended tonight's restrictions until this time (ms), or null. */
  overriddenUntil: number | null;
  /** Names of the DeviceActivity schedules being monitored. */
  monitoring: string[];
};

export type TerbitScreenTimeNativeModule = {
  getAuthorizationStatusAsync(): Promise<NativeAuthorizationStatus>;
  requestAuthorizationAsync(): Promise<NativeAuthorizationResult>;
  /** Apple's app and category picker. Null if cancelled. */
  pickAppsAsync(current: string | null): Promise<NativeAppSelection | null>;
  applyPlanAsync(plan: NativeNightPlan): Promise<{ scheduled: number; restarted: boolean; errors: string[] }>;
  clearAsync(): Promise<void>;
  /** Ends tonight's restrictions until `untilMs` (the night's end). */
  endTonightAsync(untilMs: number): Promise<void>;
  getStateAsync(): Promise<NativeScreenTimeState>;
};
