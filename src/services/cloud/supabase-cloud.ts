
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { authStorage } from './auth-storage';
import type { CloudConfig } from './config';
import { CloudError, type AuthService, type Cloud, type CloudStore, type CloudUser } from './types';

/** Turns any Supabase/network failure into a CloudError the sync layer understands. */
export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error;
  const e = error as { message?: string; status?: number; code?: string; name?: string } | null;
  const message = e?.message ?? String(error);
  if (
    e?.name === 'AuthRetryableFetchError' ||
    e?.status === 0 ||
    /network request failed|failed to fetch|network error|timed? ?out|offline|internet/i.test(message)
  ) {
    return new CloudError(message, 'offline');
  }
  if (e?.status === 401 || e?.code === 'PGRST301' || /jwt|not signed in|session/i.test(message)) {
    return new CloudError(message, 'auth');
  }
  return new CloudError(message, 'server');
}

async function run<T>(call: PromiseLike<{ data?: T; error: unknown }>): Promise<T> {
  let result: { data?: T; error: unknown };
  try {
    result = await call;
  } catch (error) {
    throw toCloudError(error);
  }
  if (result.error) throw toCloudError(result.error);
  return result.data as T;
}

const toUser = (u: { id: string; email?: string | null }): CloudUser => ({ id: u.id, email: u.email ?? null });

/** Supabase's own default key for the saved session (kept, so existing sign-ins carry over). */
export const sessionStorageKey = (url: string) => `sb-${url.replace(/^https?:\/\//, '').split(/[./:]/)[0]}-auth-token`;

/**
 * The user in a saved Supabase session, or null. Used only when the phone is
 * offline: Supabase keeps the session but can't refresh the expired access
 * token, so `getSession()` returns nothing even though the user is still
 * signed in on this phone.
 */
export function storedSessionUser(raw: string | null): CloudUser | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { refresh_token?: unknown; user?: { id?: unknown; email?: unknown } };
    if (typeof session.refresh_token !== 'string' || typeof session.user?.id !== 'string') return null;
    return { id: session.user.id, email: typeof session.user.email === 'string' ? session.user.email : null };
  } catch {
    return null;
  }
}

type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'signInWithOtp' | 'verifyOtp' | 'signOut' | 'onAuthStateChange'>;

export function createAuth(auth: AuthClient, readStoredSession: () => string | null | Promise<string | null>): AuthService {
  return {
    async currentUser() {
      // The saved session (read from the phone; refreshed if it can be).
      const { data, error } = await auth.getSession();
      if (data.session) return toUser(data.session.user);
      // Offline with an expired access token: still signed in on this phone.
      // (Supabase removes the saved session itself when the sign-in really ended.)
      if (error && toCloudError(error).kind === 'offline') return storedSessionUser(await readStoredSession());
      return null;
    },
    async sendCode(email) {
      await run(auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    },
    async verifyCode(email, code) {
      const data = await run(auth.verifyOtp({ email, token: code, type: 'email' }));
      if (!data.user) throw new CloudError('The code was not accepted.', 'auth');
      return toUser(data.user);
    },
    async signOut() {
      // 'local': end this phone's session even when offline.
      await run(auth.signOut({ scope: 'local' }));
    },
    onChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        // The first event only repeats the saved session, and reports none while
        // offline with an expired token; `currentUser()` handles start-up instead.
        if (event === 'INITIAL_SESSION') return;
        if (session) listener({ user: toUser(session.user) });
        // Only a real sign-out (by the user, or Supabase ending the session) means no user.
        else if (event === 'SIGNED_OUT') listener({ user: null });
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

function createStore(client: SupabaseClient): CloudStore {
  return {
    async getProfile(userId) {
      type ProfileRow = { display_name: string | null; avatar_url: string | null; timezone: string | null; faith_preference: string | null };
      const row = await run<ProfileRow | null>(
        client.from('profiles').select('display_name, avatar_url, timezone, faith_preference').eq('id', userId).maybeSingle<ProfileRow>(),
      );
      return row
        ? { displayName: row.display_name, avatarUrl: row.avatar_url, timezone: row.timezone, faithPreference: row.faith_preference }
        : null;
    },
    async upsertProfile(userId, profile) {
      const row: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
      if (profile.displayName !== undefined) row.display_name = profile.displayName;
      if (profile.avatarUrl !== undefined) row.avatar_url = profile.avatarUrl;
      if (profile.timezone !== undefined) row.timezone = profile.timezone;
      if (profile.faithPreference !== undefined) row.faith_preference = profile.faithPreference;
      await run(client.from('profiles').upsert(row, { onConflict: 'id' }));
    },
    async pushAlarms(rows) {
      if (rows.length) await run(client.rpc('sync_alarms', { items: rows }));
    },
    async deleteAlarms(ids, deletedAt) {
      if (!ids.length) return;
      await run(
        client
          .from('alarms')
          .update({ deleted_at: deletedAt, updated_at: deletedAt })
          .in('id', ids)
          .lte('updated_at', deletedAt),
      );
    },
    async pushOccurrences(rows) {
      if (rows.length) await run(client.rpc('sync_alarm_occurrences', { items: rows }));
    },
    async pushXp(rows) {
      if (rows.length) await run(client.from('xp_ledger').upsert(rows, { onConflict: 'user_id,award_key', ignoreDuplicates: true }));
    },
    async pushAchievements(rows) {
      if (rows.length) await run(client.from('achievements').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true }));
    },
    async deleteAccount() {
      await run(client.rpc('delete_my_account'));
    },
  };
}

/**
 * Supabase-backed cloud. The session is saved on the phone (expo-sqlite
 * localStorage), so the user stays signed in across restarts and offline.
 */
export function createSupabaseCloud(config: CloudConfig): Cloud {
  const storageKey = sessionStorageKey(config.url);
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      storage: authStorage,
      storageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  // Refresh tokens only while the app is in front.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return { auth: createAuth(client.auth, () => authStorage.getItem(storageKey)), store: createStore(client) };
}
