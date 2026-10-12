import {
  CloudError,
  type AuthEvent,
  type Cloud,
  type CloudAchievementRow,
  type CloudAlarmRow,
  type CloudOccurrenceRow,
  type CloudProfile,
  type CloudUser,
  type CloudXpRow,
} from '../types';

/**
 * TEST ONLY. An in-memory cloud that behaves like the Supabase schema:
 * rows are scoped to the signed-in user (like Row Level Security), alarms and
 * occurrences keep the newest `updated_at`, the XP ledger and achievements
 * insert once. `online = false` makes every call fail as offline.
 */
export function createMemoryCloud() {
  let session: CloudUser | null = null;
  const users = new Map<string, CloudUser>();
  const pendingCodes = new Map<string, string>();
  const listeners = new Set<(e: AuthEvent) => void>();
  const tables = {
    profiles: new Map<string, CloudProfile>(),
    alarms: new Map<string, CloudAlarmRow & { user_id: string; deleted_at: number | null }>(),
    occurrences: new Map<string, CloudOccurrenceRow & { user_id: string }>(),
    xp: new Map<string, CloudXpRow & { user_id: string }>(),
    achievements: new Map<string, CloudAchievementRow & { user_id: string }>(),
  };
  const state = { online: true, calls: 0, failNext: 0 };

  function guard(): string {
    state.calls += 1;
    if (!state.online) throw new CloudError('Network request failed', 'offline');
    if (state.failNext > 0) {
      state.failNext -= 1;
      throw new CloudError('Server error', 'server');
    }
    if (!session) throw new CloudError('Not signed in', 'auth');
    return session.id;
  }
  const key = (userId: string, id: string) => `${userId}/${id}`;
  const emit = () => listeners.forEach((l) => l({ user: session }));

  const cloud: Cloud = {
    auth: {
      async currentUser() {
        return session;
      },
      async sendCode(email) {
        if (!state.online) throw new CloudError('Network request failed', 'offline');
        pendingCodes.set(email, '123456');
      },
      async verifyCode(email, code) {
        if (!state.online) throw new CloudError('Network request failed', 'offline');
        if (pendingCodes.get(email) !== code) throw new CloudError('Invalid code', 'auth');
        pendingCodes.delete(email);
        let user = [...users.values()].find((u) => u.email === email);
        if (!user) {
          user = { id: `user-${users.size + 1}`, email };
          users.set(user.id, user);
          tables.profiles.set(user.id, { displayName: null, avatarUrl: null, timezone: null }); // like the signup trigger
        }
        session = user;
        emit();
        return user;
      },
      async signOut() {
        session = null;
        emit();
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    store: {
      async getProfile(userId) {
        const me = guard();
        return me === userId ? (tables.profiles.get(userId) ?? null) : null; // RLS: own row only
      },
      async upsertProfile(userId, profile) {
        const me = guard();
        if (me !== userId) throw new CloudError('Row level security', 'server');
        const current = tables.profiles.get(userId) ?? { displayName: null, avatarUrl: null, timezone: null };
        tables.profiles.set(userId, { ...current, ...profile });
      },
      async pushAlarms(rows) {
        const me = guard();
        for (const row of rows) {
          const existing = tables.alarms.get(key(me, row.id));
          if (!existing || existing.updated_at <= row.updated_at) {
            tables.alarms.set(key(me, row.id), { ...row, user_id: me, deleted_at: null });
          }
        }
      },
      async deleteAlarms(ids, deletedAt) {
        const me = guard();
        for (const id of ids) {
          const existing = tables.alarms.get(key(me, id));
          if (existing && existing.updated_at <= deletedAt) {
            tables.alarms.set(key(me, id), { ...existing, deleted_at: deletedAt, updated_at: deletedAt });
          }
        }
      },
      async pushOccurrences(rows) {
        const me = guard();
        for (const row of rows) {
          const clash = [...tables.occurrences.values()].find(
            (o) => o.user_id === me && o.alarm_id === row.alarm_id && o.scheduled_at === row.scheduled_at && o.id !== row.id,
          );
          if (clash) throw new CloudError('duplicate key value violates unique constraint', 'server');
          const existing = tables.occurrences.get(key(me, row.id));
          if (!existing || existing.updated_at <= row.updated_at) tables.occurrences.set(key(me, row.id), { ...row, user_id: me });
        }
      },
      async pushXp(rows) {
        const me = guard();
        for (const row of rows) if (!tables.xp.has(key(me, row.award_key))) tables.xp.set(key(me, row.award_key), { ...row, user_id: me });
      },
      async pushAchievements(rows) {
        const me = guard();
        for (const row of rows) if (!tables.achievements.has(key(me, row.id))) tables.achievements.set(key(me, row.id), { ...row, user_id: me });
      },
      async deleteAccount() {
        const me = guard();
        for (const table of [tables.alarms, tables.occurrences, tables.xp, tables.achievements]) {
          for (const [k, row] of table) if (row.user_id === me) table.delete(k);
        }
        tables.profiles.delete(me);
        users.delete(me);
        session = null;
        emit();
      },
    },
  };

  /** Rows a given user owns, as the server would return them to that user. */
  const owned = <T extends { user_id: string }>(table: Map<string, T>, userId: string) =>
    [...table.values()].filter((r) => r.user_id === userId);

  return { cloud, tables, state, owned, users };
}

export type MemoryCloud = ReturnType<typeof createMemoryCloud>;
