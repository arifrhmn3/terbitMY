/**
 * The cloud as the rest of the app sees it: an optional account (AuthService)
 * and a private backup store (CloudStore). Features never call Supabase
 * directly. When no Supabase project is configured, `getCloud()` returns
 * null and Terbit MY runs fully on the phone.
 */

export type CloudUser = { id: string; email: string | null };

export type AuthEvent = { user: CloudUser | null };

export interface AuthService {
  /** The signed-in user restored from the saved session, or null (guest). */
  currentUser(): Promise<CloudUser | null>;
  /** Emails a one-time sign-in code. Creates the account on first use. */
  sendCode(email: string): Promise<void>;
  /** Signs in with the emailed code. */
  verifyCode(email: string, code: string): Promise<CloudUser>;
  /** Ends the session on this phone. Never touches local data. */
  signOut(): Promise<void>;
  onChange(listener: (event: AuthEvent) => void): () => void;
}

export type CloudProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  /** PRIVATE (owner-only). Never shown to other users or used in social features. */
  faithPreference: string | null;
};

/** Row shapes sent to the cloud (snake_case, as in the Supabase tables). */
export type CloudAlarmRow = {
  id: string;
  hour: number;
  minute: number;
  weekdays: number[];
  enabled: boolean;
  label: string;
  mission: unknown;
  snooze: unknown;
  is_main_wake_up: boolean;
  completion_mode: string;
  gentle_reminder_minutes: number;
  sound_id: string;
  created_at: number;
  updated_at: number;
};

export type CloudOccurrenceRow = {
  id: string;
  alarm_id: string;
  scheduled_at: number;
  source: string;
  status: string;
  alarm_label: string;
  was_main_wake_up: boolean;
  mission: unknown;
  snooze_minutes: number | null;
  completion_mode: string;
  gentle_reminder_minutes: number;
  fire_evidence: string;
  started_at: number | null;
  alarm_stopped_at: number | null;
  alarm_stop_reason: string | null;
  mission_started_at: number | null;
  mission_completed_at: number | null;
  ended_at: number | null;
  result: unknown;
  created_at: number;
  updated_at: number;
};

export type CloudXpRow = {
  award_key: string;
  occurrence_id: string | null;
  category: string | null;
  amount: number;
  reason: string;
  earned_at: number;
};

export type CloudAchievementRow = {
  id: string;
  unlocked_at: number;
  occurrence_id: string | null;
};

/**
 * The signed-in user's private cloud backup. Every call acts on the caller's
 * own rows only (enforced by Row Level Security on the server). All writes
 * are idempotent: sending the same rows again changes nothing.
 */
export interface CloudStore {
  getProfile(userId: string): Promise<CloudProfile | null>;
  upsertProfile(userId: string, profile: Partial<CloudProfile>): Promise<void>;
  /** Insert or update; an older copy never overwrites a newer one (by `updated_at`). */
  pushAlarms(rows: CloudAlarmRow[]): Promise<void>;
  /** Marks alarms deleted on the phone (tombstones), unless the cloud copy is newer. */
  deleteAlarms(ids: string[], deletedAt: number): Promise<void>;
  /** Insert or update; an older copy never overwrites a newer one. */
  pushOccurrences(rows: CloudOccurrenceRow[]): Promise<void>;
  /** Insert once; rows already there are left alone. */
  pushXp(rows: CloudXpRow[]): Promise<void>;
  /** Insert once; rows already there are left alone. */
  pushAchievements(rows: CloudAchievementRow[]): Promise<void>;
  /** Deletes the account and all its cloud data. Local data is not touched. */
  deleteAccount(): Promise<void>;
}

/** Why a cloud call failed: no connection (retry later) or anything else. */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'auth' | 'server',
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

export type Cloud = { auth: AuthService; store: CloudStore };
