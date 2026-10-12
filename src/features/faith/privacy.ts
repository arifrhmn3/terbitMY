/**
 * Faith preference is private. These helpers are the only way profile data
 * leaves the private profile (future Circles, friends, public profiles,
 * social features, analytics). They allow-list fields, so a new private
 * field can never leak by default.
 */

/** Profile fields other people may ever see. `faithPreference` is deliberately absent. */
export const PUBLIC_PROFILE_FIELDS = ['displayName', 'avatarUrl'] as const;

export type PublicProfile = { displayName: string | null; avatarUrl: string | null };

export function toPublicProfile(profile: Partial<Record<string, unknown>>): PublicProfile {
  return {
    displayName: typeof profile.displayName === 'string' ? profile.displayName : null,
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : null,
  };
}
