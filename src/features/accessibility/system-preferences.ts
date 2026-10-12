/**
 * iPhone accessibility preferences Terbit MY follows automatically. They're
 * not permissions: there's nothing to allow, and Terbit MY's own page in
 * iPhone Settings has no switch for them. Terbit MY only reads them and
 * shows where they live; it never opens Settings for them, because iOS has
 * no supported link to those Accessibility pages.
 */
export type SystemPreferenceId = 'reduce_motion' | 'larger_text';

export type SystemPreferenceInfo = {
  title: string;
  /** What Terbit MY does when it's on. */
  effect: string;
  /** Where the user changes it, in iPhone Settings. */
  iphonePath: string;
  /** Optional extra way to change it, if the iOS version has it. */
  alsoPath?: string;
};

export const SYSTEM_PREFERENCES: Record<SystemPreferenceId, SystemPreferenceInfo> = {
  reduce_motion: {
    title: 'Reduce Motion',
    effect: 'Screens fade instead of sliding or zooming. Progress bars still show progress.',
    iphonePath: 'iPhone Settings → Accessibility → Motion → Reduce Motion',
  },
  larger_text: {
    title: 'Text size',
    effect: 'Text grows with your setting; rows and choices stack so nothing is cut off.',
    iphonePath: 'iPhone Settings → Accessibility → Display & Text Size → Larger Text',
    alsoPath: 'Or just for Terbit MY, if your iOS version has it: iPhone Settings → Accessibility → Per-App Settings → Terbit MY',
  },
};

export const FOLLOWS_IPHONE = 'Follows iPhone setting';

/**
 * Read-only statuses. What the iPhone reported, or null when it hasn't
 * answered (or can't): then the status only says Terbit MY follows the
 * setting, and never guesses a value.
 */
export function reduceMotionStatus(reported: boolean | null): string {
  if (reported === null) return FOLLOWS_IPHONE;
  return `${FOLLOWS_IPHONE} · ${reported ? 'On' : 'Off'}`;
}

/** `fontScale` is the system text scale (1 = default size). */
export function textSizeStatus(fontScale: number | null): string {
  if (fontScale === null || !Number.isFinite(fontScale) || fontScale <= 0) return FOLLOWS_IPHONE;
  const size = fontScale > 1.01 ? 'Larger' : fontScale < 0.99 ? 'Smaller' : 'Default';
  return `${FOLLOWS_IPHONE} · ${size}`;
}
