import { CloudError } from '@/services/cloud/types';

/** Plain words for every Circles outcome. Raw Supabase errors are never shown (developer builds add them in brackets). */
export const CIRCLE_MESSAGES = {
  offline: 'You’re offline. Try again when you’re connected.',
  signInAgain: 'Sign in again to use Circles.',
  invalidCode: 'That invite code isn’t valid. Check it, or ask for a new one.',
  alreadyMember: 'You’re already in this Circle.',
  rateLimited: 'Too many tries. Wait 15 minutes, then try again.',
  full: 'This Circle is full (50 members).',
  needsName: 'Choose how people in your Circles see you first.',
  limitReached: 'You can own up to 20 Circles.',
  invalidName: 'That name can’t be used. Use 1–40 letters, numbers or spaces.',
  notAllowed: 'Only the Circle’s owner can do that.',
  gone: 'This Circle no longer exists, or you’re no longer a member.',
} as const;

export type CircleAction = 'load' | 'save_name' | 'create' | 'preview' | 'join' | 'invite' | 'rename' | 'leave' | 'dissolve';

const FALLBACK: Record<CircleAction, string> = {
  load: 'Couldn’t load your Circles. Try again.',
  save_name: 'Couldn’t save your name. Try again.',
  create: 'Couldn’t create the Circle. Try again.',
  preview: 'Couldn’t check the code. Try again.',
  join: 'Couldn’t join the Circle. Try again.',
  invite: 'Couldn’t get an invite code. Try again.',
  rename: 'Couldn’t rename the Circle. Try again.',
  leave: 'Couldn’t leave the Circle. Try again.',
  dissolve: 'Couldn’t delete the Circle. Try again.',
};

export function isOffline(error: unknown): boolean {
  return error instanceof CloudError && error.kind === 'offline';
}

/** A failed cloud call in plain words. */
export function friendlyCircleError(error: unknown, action: CircleAction, dev: boolean = __DEV__): string {
  const plain = isOffline(error)
    ? CIRCLE_MESSAGES.offline
    : error instanceof CloudError && error.kind === 'auth'
      ? CIRCLE_MESSAGES.signInAgain
      : FALLBACK[action];
  const raw = error instanceof Error ? error.message : String(error);
  return dev ? `${plain} (${raw})` : plain;
}
