import type { AccountState } from '@/features/account/account-store';
import type { CircleDetail, CircleIdentity, CircleInvite, CircleSummary, Cloud } from '@/services/cloud';
import type { SettingsStore } from '@/services/storage/settings';

import { CIRCLE_MESSAGES, friendlyCircleError, isOffline, type CircleAction } from './messages';
import { checkName, isCompleteInviteCode, normaliseInviteCode } from './validation';

/**
 * - unavailable: this build has no cloud configured;
 * - signed_out: a guest (Circles need an account; nothing else does);
 * - loading: restoring the account, or the first fetch;
 * - ready: the list is fresh from the cloud;
 * - offline: the cloud couldn't be reached; the last known copy (if any) is shown;
 * - error: anything else.
 */
export type CirclesStatus = 'unavailable' | 'signed_out' | 'loading' | 'ready' | 'offline' | 'error';

export type CirclesState = {
  status: CirclesStatus;
  userId: string | null;
  /** The user's Circle display name; null when not chosen yet (once `identityLoaded`). */
  identity: CircleIdentity | null;
  identityLoaded: boolean;
  circles: CircleSummary[];
  details: Record<string, CircleDetail>;
  /** Current invite codes (owner only), kept in memory. */
  invites: Record<string, CircleInvite>;
  /** When the shown data last came from the cloud (ms); null if never. */
  syncedAt: number | null;
  /** Plain-language reason for `offline` / `error`. */
  error: string | null;
};

/** What a Circles action did, with a plain message when it didn't work. */
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; message: string; offline?: boolean };

/** Last known Circles for read-only offline display. Removed when the user signs out. */
type CachedCircles = {
  userId: string;
  savedAt: number;
  identity: CircleIdentity | null;
  circles: CircleSummary[];
  details: Record<string, CircleDetail>;
};

export const CIRCLES_CACHE_KEY = 'circles.cache';

type AccountSource = {
  getState(): Pick<AccountState, 'status' | 'user'>;
  subscribe(listener: () => void): () => void;
};

const EMPTY = { identity: null, identityLoaded: false, circles: [], details: {}, invites: {}, syncedAt: null, error: null };

/**
 * Private Circles for the signed-in user. Nothing here runs at app start-up
 * or touches alarms, missions or progress: data is fetched only when a
 * Circles screen asks (`refresh`), and a failure only affects Circles.
 */
export function createCirclesStore(deps: {
  cloud: Cloud | null;
  account: AccountSource;
  settings: SettingsStore;
  now?: () => number;
  dev?: boolean;
}) {
  const { cloud, account, settings, now = Date.now, dev = __DEV__ } = deps;
  let state: CirclesState = { status: cloud ? 'loading' : 'unavailable', userId: null, ...EMPTY };
  const listeners = new Set<() => void>();
  let refreshing: Promise<void> | null = null;
  /** True once this user's list has come from the cloud in this session (a cache must not overwrite it). */
  let fresh = false;
  let started = false;

  function set(next: Partial<CirclesState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  }

  const failure = (error: unknown, action: CircleAction): Outcome<never> => ({
    ok: false,
    message: friendlyCircleError(error, action, dev),
    offline: isOffline(error),
  });
  const refused = (message: string): Outcome<never> => ({ ok: false, message });
  const signedIn = () => (cloud && state.userId ? { api: cloud.circles, userId: state.userId } : null);
  const notSignedIn = () => refused('Sign in to create or join Circles.');

  async function persist() {
    if (!state.userId) return;
    const cached: CachedCircles = {
      userId: state.userId,
      savedAt: state.syncedAt ?? now(),
      identity: state.identity,
      circles: state.circles,
      details: state.details,
    };
    await settings.set(CIRCLES_CACHE_KEY, cached).catch(() => {});
  }

  async function clearCache() {
    const cached = await settings.get<CachedCircles>(CIRCLES_CACHE_KEY).catch(() => null);
    if (cached) await settings.set(CIRCLES_CACHE_KEY, null).catch(() => {});
  }

  async function loadCache(userId: string) {
    const cached = await settings.get<CachedCircles>(CIRCLES_CACHE_KEY).catch(() => null);
    if (!cached || cached.userId !== userId || state.userId !== userId || fresh) return;
    set({
      identity: cached.identity,
      identityLoaded: cached.identity !== null,
      circles: cached.circles,
      details: cached.details,
      syncedAt: cached.savedAt,
    });
  }

  function applyAccount() {
    const { status, user } = account.getState();
    if (!cloud || status === 'unavailable') return set({ status: 'unavailable', userId: null, ...EMPTY });
    if (status === 'loading') return set({ status: 'loading', userId: null, ...EMPTY });
    if (status === 'guest' || !user) {
      if (state.status !== 'signed_out') set({ status: 'signed_out', userId: null, ...EMPTY });
      // Other people's Circle names never stay on a phone after sign-out.
      clearCache();
      return;
    }
    if (user.id === state.userId) return;
    fresh = false;
    set({ status: 'loading', userId: user.id, ...EMPTY });
    loadCache(user.id);
  }

  /** Puts a changed Circle into the list (or removes it), keeping the order. */
  function replaceCircle(id: string, summary: CircleSummary | null, detail?: CircleDetail | null) {
    const circles = summary
      ? state.circles.some((c) => c.id === id)
        ? state.circles.map((c) => (c.id === id ? summary : c))
        : [...state.circles, summary]
      : state.circles.filter((c) => c.id !== id);
    const details = { ...state.details };
    const invites = { ...state.invites };
    if (detail) details[id] = detail;
    if (!summary) {
      delete details[id];
      delete invites[id];
    }
    set({ circles, details, invites });
    persist();
  }

  /** Fetches the display name and Circle list. Safe to call often. */
  function refresh(): Promise<void> {
    const session = signedIn();
    if (!session) return Promise.resolve();
    refreshing ??= (async () => {
      const { api, userId } = session;
      if (!fresh && state.status !== 'loading') set({ status: 'loading' });
      try {
        const [identity, circles] = await Promise.all([api.getMyIdentity(userId), api.listCircles(userId)]);
        if (state.userId !== userId) return;
        fresh = true;
        const listed = new Set(circles.map((c) => c.id));
        const details = Object.fromEntries(Object.entries(state.details).filter(([id]) => listed.has(id)));
        set({ status: 'ready', identity, identityLoaded: true, circles, details, syncedAt: now(), error: null });
        await persist();
      } catch (error) {
        if (state.userId !== userId) return;
        set({ status: isOffline(error) ? 'offline' : 'error', error: friendlyCircleError(error, 'load', dev) });
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Follows the account. No network. */
    start() {
      if (started) return;
      started = true;
      account.subscribe(applyAccount);
      applyAccount();
    },

    /** Fetches the display name and Circle list. Safe to call often. */
    refresh,

    /** Loads one Circle's members. `gone` when the user is no longer in it. */
    async loadCircle(circleId: string): Promise<Outcome<{ gone: boolean }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      try {
        const detail = await session.api.getCircle(session.userId, circleId);
        if (state.userId !== session.userId) return notSignedIn();
        replaceCircle(circleId, detail?.circle ?? null, detail);
        return { ok: true, gone: detail === null };
      } catch (error) {
        return failure(error, 'load');
      }
    },

    async setDisplayName(raw: string): Promise<Outcome> {
      const session = signedIn();
      if (!session) return notSignedIn();
      const checked = checkName(raw);
      if (!checked.ok) return refused(checked.problem);
      try {
        const result = await session.api.setMyIdentity(checked.name);
        if (result.status !== 'saved') return refused(CIRCLE_MESSAGES.invalidName);
        const identity = { displayName: result.displayName };
        // My own name in any member list shown from memory.
        const details = Object.fromEntries(
          Object.entries(state.details).map(([id, d]) => [
            id,
            { ...d, members: d.members.map((m) => (m.userId === session.userId ? { ...m, displayName: identity.displayName } : m)) },
          ]),
        );
        set({ identity, identityLoaded: true, details });
        await persist();
        return { ok: true };
      } catch (error) {
        return failure(error, 'save_name');
      }
    },

    async create(raw: string): Promise<Outcome<{ circleId: string }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      const checked = checkName(raw);
      if (!checked.ok) return refused(checked.problem);
      try {
        const result = await session.api.createCircle(checked.name);
        if (result.status === 'needs_name') {
          set({ identity: null, identityLoaded: true });
          return refused(CIRCLE_MESSAGES.needsName);
        }
        if (result.status === 'limit_reached') return refused(CIRCLE_MESSAGES.limitReached);
        if (result.status !== 'created') return refused(CIRCLE_MESSAGES.invalidName);
        set({ invites: { ...state.invites, [result.circleId]: result.invite } });
        replaceCircle(result.circleId, { id: result.circleId, name: checked.name, role: 'owner', memberCount: 1 });
        return { ok: true, circleId: result.circleId };
      } catch (error) {
        return failure(error, 'create');
      }
    },

    /** Checks a code and shows only the Circle's name. */
    async preview(code: string): Promise<Outcome<{ circleName: string; alreadyMember: boolean }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      if (!isCompleteInviteCode(code)) return refused(CIRCLE_MESSAGES.invalidCode);
      try {
        const result = await session.api.previewInvite(normaliseInviteCode(code));
        if (result.status === 'valid') return { ok: true, circleName: result.circleName, alreadyMember: result.alreadyMember };
        return refused(result.status === 'rate_limited' ? CIRCLE_MESSAGES.rateLimited : CIRCLE_MESSAGES.invalidCode);
      } catch (error) {
        return failure(error, 'preview');
      }
    },

    async join(code: string): Promise<Outcome<{ circleId: string; circleName: string; alreadyMember: boolean }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      if (!isCompleteInviteCode(code)) return refused(CIRCLE_MESSAGES.invalidCode);
      try {
        const result = await session.api.joinByCode(normaliseInviteCode(code));
        if (result.status === 'joined' || result.status === 'already_member') {
          refresh();
          return { ok: true, circleId: result.circleId, circleName: result.circleName, alreadyMember: result.status === 'already_member' };
        }
        if (result.status === 'needs_name') {
          set({ identity: null, identityLoaded: true });
          return refused(CIRCLE_MESSAGES.needsName);
        }
        return refused(
          result.status === 'rate_limited'
            ? CIRCLE_MESSAGES.rateLimited
            : result.status === 'full'
              ? CIRCLE_MESSAGES.full
              : CIRCLE_MESSAGES.invalidCode,
        );
      } catch (error) {
        return failure(error, 'join');
      }
    },

    /** The current invite code (owner only). */
    async invite(circleId: string): Promise<Outcome<{ invite: CircleInvite | null }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      try {
        const invite = await session.api.getInvite(circleId);
        const invites = { ...state.invites };
        if (invite) invites[circleId] = invite;
        else delete invites[circleId];
        set({ invites });
        return { ok: true, invite };
      } catch (error) {
        return failure(error, 'invite');
      }
    },

    /** Owner only: a new code; the old one stops working. */
    async newInvite(circleId: string): Promise<Outcome<{ invite: CircleInvite }>> {
      const session = signedIn();
      if (!session) return notSignedIn();
      try {
        const invite = await session.api.newInvite(circleId);
        if (!invite) return refused(CIRCLE_MESSAGES.notAllowed);
        set({ invites: { ...state.invites, [circleId]: invite } });
        return { ok: true, invite };
      } catch (error) {
        return failure(error, 'invite');
      }
    },

    async rename(circleId: string, raw: string): Promise<Outcome> {
      const session = signedIn();
      if (!session) return notSignedIn();
      const checked = checkName(raw);
      if (!checked.ok) return refused(checked.problem);
      try {
        if (!(await session.api.renameCircle(circleId, checked.name))) return refused(CIRCLE_MESSAGES.notAllowed);
        const current = state.circles.find((c) => c.id === circleId);
        const detail = state.details[circleId];
        if (current) {
          const summary = { ...current, name: checked.name };
          replaceCircle(circleId, summary, detail ? { ...detail, circle: summary } : undefined);
        }
        return { ok: true };
      } catch (error) {
        return failure(error, 'rename');
      }
    },

    /** Members leave. Owners can't (they delete the Circle instead). */
    async leave(circleId: string): Promise<Outcome> {
      const session = signedIn();
      if (!session) return notSignedIn();
      if (state.circles.find((c) => c.id === circleId)?.role === 'owner') {
        return refused('As the owner, you can delete this Circle instead.');
      }
      try {
        const left = await session.api.leaveCircle(session.userId, circleId);
        replaceCircle(circleId, null);
        return left ? { ok: true } : refused(CIRCLE_MESSAGES.gone);
      } catch (error) {
        return failure(error, 'leave');
      }
    },

    /** Owner only: deletes the Circle for everyone. */
    async dissolve(circleId: string): Promise<Outcome> {
      const session = signedIn();
      if (!session) return notSignedIn();
      try {
        if (!(await session.api.dissolveCircle(circleId))) return refused(CIRCLE_MESSAGES.notAllowed);
        replaceCircle(circleId, null);
        return { ok: true };
      } catch (error) {
        return failure(error, 'dissolve');
      }
    },
  };
}

export type CirclesStore = ReturnType<typeof createCirclesStore>;
