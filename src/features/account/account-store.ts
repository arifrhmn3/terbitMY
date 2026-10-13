import type { Cloud, CloudProfile, CloudUser } from '@/services/cloud';

/**
 * - unavailable: this build has no cloud configured; Terbit MY is local-only;
 * - loading: restoring the saved session;
 * - guest: using Terbit MY on this phone without an account (fully supported);
 * - signed_in.
 */
export type AccountStatus = 'unavailable' | 'loading' | 'guest' | 'signed_in';

export type AccountState = {
  status: AccountStatus;
  user: CloudUser | null;
  profile: CloudProfile | null;
  /**
   * The sign-in ended without the user signing out (e.g. Supabase rejected an
   * old session): show "Sign-in required". Local data is untouched.
   */
  sessionEnded: boolean;
};

/** The phone's time zone name (e.g. "Asia/Kuala_Lumpur"), if the platform reports it. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * The optional account. Accounts never gate anything: alarms, missions, XP
 * and streaks work the same as a guest. Signing in or out never deletes
 * local data; after sign-in, `onSignedIn` starts backing the phone's
 * existing records up to the account (guest → account).
 */
export function createAccountStore(deps: {
  cloud: Cloud | null;
  onSignedIn?: (user: CloudUser) => void;
  onSignedOut?: () => void;
  timeZone?: () => string | null;
}) {
  const { cloud, onSignedIn, onSignedOut, timeZone = deviceTimeZone } = deps;
  let state: AccountState = { status: cloud ? 'loading' : 'unavailable', user: null, profile: null, sessionEnded: false };
  const listeners = new Set<() => void>();
  let started = false;
  /** True while the user's own sign-out or account deletion is in progress. */
  let leaving = false;

  function set(next: Partial<AccountState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  }

  /** Makes sure the profile exists and has the phone's time zone; best effort (works offline later). */
  async function loadProfile(user: CloudUser) {
    if (!cloud) return;
    try {
      let profile = await cloud.store.getProfile(user.id);
      const tz = timeZone();
      if (!profile || (tz && profile.timezone !== tz)) {
        await cloud.store.upsertProfile(user.id, { timezone: tz });
        profile = {
          displayName: profile?.displayName ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          timezone: tz,
          faithPreference: profile?.faithPreference ?? null,
        };
      }
      if (state.user?.id === user.id) set({ profile });
    } catch {
      // Offline or the cloud is down: the account still works; the profile loads next time.
    }
  }

  function applyUser(user: CloudUser | null) {
    const was = state.user?.id ?? null;
    if (user) {
      set({ status: 'signed_in', user, profile: was === user.id ? state.profile : null, sessionEnded: false });
      if (was !== user.id) {
        loadProfile(user);
        onSignedIn?.(user);
      }
    } else {
      set({ status: 'guest', user: null, profile: null, sessionEnded: !leaving && (was !== null || state.sessionEnded) });
      if (was) onSignedOut?.();
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Restores the saved session (no network needed) and follows later changes. */
    async start() {
      if (!cloud || started) return;
      started = true;
      cloud.auth.onChange((e) => applyUser(e.user));
      applyUser(await cloud.auth.currentUser().catch(() => null));
    },
    async sendCode(email: string) {
      if (!cloud) throw new Error('Accounts aren’t available in this build.');
      await cloud.auth.sendCode(email.trim().toLowerCase());
    },
    async verifyCode(email: string, code: string) {
      if (!cloud) throw new Error('Accounts aren’t available in this build.');
      const user = await cloud.auth.verifyCode(email.trim().toLowerCase(), code.trim());
      applyUser(user);
      return user;
    },
    /** Ends the session on this phone. Alarms, history, XP and streaks stay on the phone. */
    async signOut() {
      if (!cloud) return;
      leaving = true;
      try {
        await cloud.auth.signOut();
        applyUser(null);
      } finally {
        leaving = false;
      }
    },
    async setDisplayName(name: string) {
      if (!cloud || !state.user) throw new Error('Not signed in.');
      const displayName = name.trim().slice(0, 50) || null;
      await cloud.store.upsertProfile(state.user.id, { displayName });
      set({ profile: { ...(state.profile ?? { avatarUrl: null, timezone: null, faithPreference: null }), displayName } });
    },
    /**
     * Deletes the account and its cloud data (profile, alarms, occurrences,
     * XP ledger, achievements). Data on this phone is kept: the user carries
     * on as a guest.
     */
    async deleteAccount() {
      if (!cloud || !state.user) throw new Error('Not signed in.');
      leaving = true;
      try {
        await cloud.store.deleteAccount();
        await cloud.auth.signOut().catch(() => {});
        applyUser(null);
      } finally {
        leaving = false;
      }
    },
  };
}

export type AccountStore = ReturnType<typeof createAccountStore>;
