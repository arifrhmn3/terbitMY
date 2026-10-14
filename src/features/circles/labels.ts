import type { CircleMember, CircleRole, CircleSummary } from '@/services/cloud';
import { formatLastSynced } from '@/features/sync/status-label';

import type { CirclesState } from './circles-store';

export const memberCountLabel = (n: number) => (n === 1 ? '1 member' : `${n} members`);

export const roleLabel = (role: CircleRole) => (role === 'owner' ? 'Owner' : 'Member');

/** "3 members · Owner" (owner shown; members need no badge). */
export function circleRowSubtitle(circle: CircleSummary): string {
  return circle.role === 'owner' ? `${memberCountLabel(circle.memberCount)} · Owner` : memberCountLabel(circle.memberCount);
}

/** A member row: their Circle display name only, plus "(you)" and the owner badge. */
export function memberRowLabel(member: CircleMember, myUserId: string | null): { title: string; subtitle?: string } {
  const name = member.displayName ?? 'Member';
  const title = member.userId === myUserId ? `${name} (you)` : name;
  return member.role === 'owner' ? { title, subtitle: 'Owner' } : { title };
}

/** The banner shown above the Circles list when the latest fetch failed; null when everything's fine. */
export function circlesNotice(state: Pick<CirclesState, 'status' | 'error' | 'syncedAt'>, now: number = Date.now()) {
  if (state.status !== 'offline' && state.status !== 'error') return null;
  const shown = state.syncedAt ? ` Showing your Circles as of ${formatLastSynced(state.syncedAt, now)}.` : '';
  return state.status === 'offline'
    ? { title: 'Offline', description: `You’re offline. Circles need the internet; everything else in Terbit MY works as usual.${shown}` }
    : { title: 'Circles unavailable', description: `${state.error ?? 'Couldn’t load your Circles.'}${shown}` };
}
