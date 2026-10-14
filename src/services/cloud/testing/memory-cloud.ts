import {
  CloudError,
  type AuthEvent,
  type CircleInvite,
  type CircleRole,
  type CircleSummary,
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
 * insert once. `online = false` makes every call fail as offline; `failNext`
 * fails the next calls with `failKind` (a server error or a rejected sign-in).
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
  const state: { online: boolean; calls: number; failNext: number; failKind: 'server' | 'auth'; now: () => number } = {
    online: true,
    calls: 0,
    failNext: 0,
    failKind: 'server',
    now: () => Date.now(),
  };
  /** Circles tables (separate from the backup tables above), with the same rules as the Circles migration. */
  const circleTables = {
    identities: new Map<string, { displayName: string }>(),
    circles: new Map<string, { id: string; name: string; ownerUserId: string; createdAt: number }>(),
    members: new Map<string, { circleId: string; userId: string; role: CircleRole; joinedAt: number }>(),
    invites: new Map<string, { code: string; circleId: string; expiresAt: number }>(),
    failures: new Map<string, number[]>(),
  };

  function guard(): string {
    state.calls += 1;
    if (!state.online) throw new CloudError('Network request failed', 'offline');
    if (state.failNext > 0) {
      state.failNext -= 1;
      throw new CloudError(state.failKind === 'auth' ? 'JWT expired' : 'Server error', state.failKind);
    }
    if (!session) throw new CloudError('Not signed in', 'auth');
    return session.id;
  }
  const key = (userId: string, id: string) => `${userId}/${id}`;
  const emit = () => listeners.forEach((l) => l({ user: session }));

  // ── Circles: the same rules as supabase/migrations/…_circles_foundation.sql ──
  const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const INVITE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const validName = (name: string) => {
    const clean = name.trim();
    return clean.length >= 1 && clean.length <= 40 && !/[\u0000-\u001f\u007f]/.test(clean) ? clean : null;
  };
  const normaliseCode = (raw: string) =>
    raw.replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  const membersOf = (circleId: string) => [...circleTables.members.values()].filter((m) => m.circleId === circleId);
  const isMember = (circleId: string, userId: string) => circleTables.members.has(key(circleId, userId));
  const sharesCircle = (me: string, other: string) =>
    [...circleTables.members.values()].some((m) => m.userId === me && isMember(m.circleId, other));
  function issueInvite(circleId: string): CircleInvite {
    for (const [code, invite] of circleTables.invites) if (invite.circleId === circleId) circleTables.invites.delete(code);
    let code = '';
    do {
      code = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * 32)]).join('');
    } while (circleTables.invites.has(code));
    const expiresAt = state.now() + INVITE_DAYS_MS;
    circleTables.invites.set(code, { code, circleId, expiresAt });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }
  function rateLimited(me: string) {
    const recent = (circleTables.failures.get(me) ?? []).filter((t) => t > state.now() - 15 * 60_000);
    circleTables.failures.set(me, recent);
    return recent.length >= 10;
  }
  /** A valid, unexpired invite's Circle, or null (and the failure is recorded). */
  function lookUp(me: string, raw: string) {
    const invite = circleTables.invites.get(normaliseCode(raw));
    const circle = invite && invite.expiresAt > state.now() ? circleTables.circles.get(invite.circleId) : undefined;
    if (!circle) circleTables.failures.set(me, [...(circleTables.failures.get(me) ?? []), state.now()]);
    return circle ?? null;
  }
  function summary(circleId: string, me: string): CircleSummary | null {
    const circle = circleTables.circles.get(circleId);
    const mine = circleTables.members.get(key(circleId, me));
    return circle && mine ? { id: circle.id, name: circle.name, role: mine.role, memberCount: membersOf(circleId).length } : null;
  }
  function dissolve(circleId: string) {
    circleTables.circles.delete(circleId);
    for (const m of membersOf(circleId)) circleTables.members.delete(key(circleId, m.userId));
    for (const [code, invite] of circleTables.invites) if (invite.circleId === circleId) circleTables.invites.delete(code);
  }

  const circles: Cloud['circles'] = {
    async getMyIdentity(userId) {
      const me = guard();
      return me === userId ? (circleTables.identities.get(userId) ?? null) : null;
    },
    async setMyIdentity(displayName) {
      const me = guard();
      const clean = validName(displayName);
      if (!clean) return { status: 'invalid_name' };
      circleTables.identities.set(me, { displayName: clean });
      return { status: 'saved', displayName: clean };
    },
    async listCircles(userId) {
      const me = guard();
      if (me !== userId) return [];
      return [...circleTables.circles.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => summary(c.id, me))
        .filter((c): c is CircleSummary => c !== null);
    },
    async getCircle(userId, circleId) {
      const me = guard();
      const circle = me === userId ? summary(circleId, me) : null;
      if (!circle) return null; // RLS: members only
      const members = membersOf(circleId)
        .sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === 'owner' ? -1 : 1))
        .map((m) => ({
          userId: m.userId,
          displayName: me === m.userId || sharesCircle(me, m.userId) ? (circleTables.identities.get(m.userId)?.displayName ?? null) : null,
          role: m.role,
          joinedAt: new Date(m.joinedAt).toISOString(),
        }));
      return { circle, members };
    },
    async getInvite(circleId) {
      const me = guard();
      if (circleTables.circles.get(circleId)?.ownerUserId !== me) return null; // owner only
      const invite = [...circleTables.invites.values()].find((i) => i.circleId === circleId);
      return invite ? { code: invite.code, expiresAt: new Date(invite.expiresAt).toISOString() } : null;
    },
    async createCircle(name) {
      const me = guard();
      if (!circleTables.identities.has(me)) return { status: 'needs_name' };
      const clean = validName(name);
      if (!clean) return { status: 'invalid_name' };
      if ([...circleTables.circles.values()].filter((c) => c.ownerUserId === me).length >= 20) return { status: 'limit_reached' };
      const id = `circle-${circleTables.circles.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
      circleTables.circles.set(id, { id, name: clean, ownerUserId: me, createdAt: state.now() });
      circleTables.members.set(key(id, me), { circleId: id, userId: me, role: 'owner', joinedAt: state.now() });
      return { status: 'created', circleId: id, invite: issueInvite(id) };
    },
    async previewInvite(code) {
      const me = guard();
      if (rateLimited(me)) return { status: 'rate_limited' };
      const circle = lookUp(me, code);
      return circle ? { status: 'valid', circleName: circle.name, alreadyMember: isMember(circle.id, me) } : { status: 'invalid' };
    },
    async joinByCode(code) {
      const me = guard();
      if (rateLimited(me)) return { status: 'rate_limited' };
      if (!circleTables.identities.has(me)) return { status: 'needs_name' };
      const circle = lookUp(me, code);
      if (!circle) return { status: 'invalid' };
      if (isMember(circle.id, me)) return { status: 'already_member', circleId: circle.id, circleName: circle.name };
      if (membersOf(circle.id).length >= 50) return { status: 'full' };
      circleTables.members.set(key(circle.id, me), { circleId: circle.id, userId: me, role: 'member', joinedAt: state.now() });
      return { status: 'joined', circleId: circle.id, circleName: circle.name };
    },
    async newInvite(circleId) {
      const me = guard();
      return circleTables.circles.get(circleId)?.ownerUserId === me ? issueInvite(circleId) : null;
    },
    async renameCircle(circleId, name) {
      const me = guard();
      const circle = circleTables.circles.get(circleId);
      if (!circle || circle.ownerUserId !== me) return false;
      const clean = validName(name);
      if (!clean || clean !== name) throw new CloudError('new row violates check constraint "circles_name_check"', 'server');
      circle.name = clean;
      return true;
    },
    async leaveCircle(userId, circleId) {
      const me = guard();
      const mine = circleTables.members.get(key(circleId, me));
      if (me !== userId || !mine || mine.role !== 'member') return false; // owners can't leave
      circleTables.members.delete(key(circleId, me));
      return true;
    },
    async dissolveCircle(circleId) {
      const me = guard();
      if (circleTables.circles.get(circleId)?.ownerUserId !== me) return false;
      dissolve(circleId);
      return true;
    },
  };

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
          tables.profiles.set(user.id, { displayName: null, avatarUrl: null, timezone: null, faithPreference: null }); // like the signup trigger
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
    circles,
    store: {
      async getProfile(userId) {
        const me = guard();
        return me === userId ? (tables.profiles.get(userId) ?? null) : null; // RLS: own row only
      },
      async upsertProfile(userId, profile) {
        const me = guard();
        if (me !== userId) throw new CloudError('Row level security', 'server');
        const current = tables.profiles.get(userId) ?? { displayName: null, avatarUrl: null, timezone: null, faithPreference: null };
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
        // Like ON DELETE CASCADE: owned Circles dissolve; memberships and the Circle identity go.
        for (const c of [...circleTables.circles.values()]) if (c.ownerUserId === me) dissolve(c.id);
        for (const [k, m] of circleTables.members) if (m.userId === me) circleTables.members.delete(k);
        circleTables.identities.delete(me);
        circleTables.failures.delete(me);
        users.delete(me);
        session = null;
        emit();
      },
    },
  };

  /** Rows a given user owns, as the server would return them to that user. */
  const owned = <T extends { user_id: string }>(table: Map<string, T>, userId: string) =>
    [...table.values()].filter((r) => r.user_id === userId);

  return { cloud, tables, circleTables, state, owned, users };
}

export type MemoryCloud = ReturnType<typeof createMemoryCloud>;
