import { TerbitScreenTime, type NativeAppSelection, type NativeNightPlan, type NativeScreenTimeState } from '../../../modules/terbit-screen-time';

/**
 * Night restrictions through Apple's Screen Time frameworks (iOS). The only
 * way the app reaches FamilyControls / ManagedSettings / DeviceActivity.
 * Everything stays on the phone: Terbit MY never learns which apps were
 * chosen or how they're used.
 *
 * Screen Time authorization status:
 * - not_configured: this build was made without the Screen Time capability (the normal development profile);
 * - unavailable: not supported here (Android, the web preview, Expo Go) or iOS reported an error (the app's minimum iOS already supports Screen Time);
 * - not_determined / approved / denied: as iOS reports it.
 */
export type ScreenTimeAuthorization = 'not_configured' | 'unavailable' | 'not_determined' | 'approved' | 'denied';

export type ScreenTimeState = { shieldActive: boolean; overriddenUntil: number | null; monitoring: string[] };

export interface ScreenTimeService {
  getAuthorization(): Promise<ScreenTimeAuthorization>;
  /** Shows Apple's Screen Time request (only after the user taps). */
  requestAuthorization(): Promise<{ status: ScreenTimeAuthorization; error?: string }>;
  /** Apple's app picker. Null if cancelled. */
  pickApps(current: string | null): Promise<NativeAppSelection | null>;
  /** Makes the native schedule match the plan (unchanged schedules aren't restarted). */
  apply(plan: NativeNightPlan): Promise<{ scheduled: number; errors: string[] }>;
  /** Stops every night schedule and removes restrictions. */
  clear(): Promise<void>;
  /** Ends tonight's restrictions until `until` (ms). */
  endTonight(until: number): Promise<void>;
  getState(): Promise<ScreenTimeState>;
}

const NO_STATE: ScreenTimeState = { shieldActive: false, overriddenUntil: null, monitoring: [] };

export const unavailableScreenTime: ScreenTimeService = {
  async getAuthorization() {
    return 'unavailable';
  },
  async requestAuthorization() {
    return { status: 'unavailable' };
  },
  async pickApps() {
    return null;
  },
  async apply() {
    return { scheduled: 0, errors: ['unavailable'] };
  },
  async clear() {},
  async endTonight() {},
  async getState() {
    return NO_STATE;
  },
};

function mapStatus(status: string): ScreenTimeAuthorization {
  if (status === 'unsupported') return 'unavailable';
  if (status === 'not_configured' || status === 'approved' || status === 'denied' || status === 'not_determined') return status;
  return 'unavailable';
}

function createForPlatform(): ScreenTimeService {
  const native = TerbitScreenTime;
  if (process.env.EXPO_OS !== 'ios' || !native) return unavailableScreenTime;
  return {
    async getAuthorization() {
      return mapStatus(await native.getAuthorizationStatusAsync().catch(() => 'unsupported'));
    },
    async requestAuthorization() {
      const result = await native.requestAuthorizationAsync();
      return { status: mapStatus(result.status), ...(result.error ? { error: result.error } : {}) };
    },
    pickApps: (current) => native.pickAppsAsync(current),
    async apply(plan) {
      const result = await native.applyPlanAsync(plan);
      return { scheduled: result.scheduled, errors: result.errors };
    },
    clear: () => native.clearAsync(),
    endTonight: (until) => native.endTonightAsync(until),
    async getState(): Promise<ScreenTimeState> {
      const state: NativeScreenTimeState = await native.getStateAsync();
      return { shieldActive: state.shieldActive, overriddenUntil: state.overriddenUntil ?? null, monitoring: state.monitoring ?? [] };
    },
  };
}

let service: ScreenTimeService | null = null;

export function getScreenTimeService(): ScreenTimeService {
  service ??= createForPlatform();
  return service;
}
