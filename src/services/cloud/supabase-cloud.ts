
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

function createAuth(client: SupabaseClient): AuthService {
  return {
    async currentUser() {
      // The saved session (read from the phone, no network needed).
      const { data } = await client.auth.getSession();
      return data.session ? toUser(data.session.user) : null;
    },
    async sendCode(email) {
      await run(client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    },
    async verifyCode(email, code) {
      const data = await run(client.auth.verifyOtp({ email, token: code, type: 'email' }));
      if (!data.user) throw new CloudError('The code was not accepted.', 'auth');
      return toUser(data.user);
    },
    async signOut() {
      // 'local': end this phone's session even when offline.
      await run(client.auth.signOut({ scope: 'local' }));
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener({ user: session ? toUser(session.user) : null });
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
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      storage: authStorage,
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
  return { auth: createAuth(client), store: createStore(client) };
}
