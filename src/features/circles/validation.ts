/**
 * Circle names, display names and invite codes. The same rules are enforced
 * by the database (supabase/migrations/…_circles_foundation.sql); checking
 * here only gives quicker, friendlier feedback.
 */

/** Longest Circle name and Circle display name (characters). */
export const NAME_MAX_LENGTH = 40;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A trimmed name, or a plain reason it can't be used. */
export function checkName(raw: string): { ok: true; name: string } | { ok: false; problem: string } {
  const name = raw.trim();
  if (!name) return { ok: false, problem: 'Enter a name.' };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, problem: `Use ${NAME_MAX_LENGTH} characters or fewer.` };
  if (CONTROL_CHARACTERS.test(name)) return { ok: false, problem: 'Use letters, numbers and spaces.' };
  return { ok: true, name };
}

/** Invite codes are 8 characters from this alphabet (Crockford base32: no I, L, O or U). */
export const INVITE_CODE_LENGTH = 8;
const INVITE_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** As typed → as stored: ignores spaces, dashes and case; O reads as 0, I and L as 1. */
export function normaliseInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function isCompleteInviteCode(raw: string): boolean {
  return INVITE_CODE.test(normaliseInviteCode(raw));
}

/** "ABCD-EFGH": easier to read aloud and type. */
export function formatInviteCode(code: string): string {
  const clean = normaliseInviteCode(code);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** "Expires in 6 days", "Expires today", "Expired". */
export function inviteExpiryLabel(expiresAt: string, now: number = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'Expires today';
  return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`;
}

export function isInviteExpired(expiresAt: string, now: number = Date.now()): boolean {
  return !(Date.parse(expiresAt) > now);
}

/** The text sent through the share sheet. Contains only the Circle's name and the code. */
export function inviteShareMessage(circleName: string, code: string): string {
  return `Join my Terbit MY Circle “${circleName}”. Open Circles → Join Circle and enter the code ${formatInviteCode(code)}.`;
}
