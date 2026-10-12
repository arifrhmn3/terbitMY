/**
 * The user's Faith preference. PRIVATE profile data: it stays on the phone,
 * and is only ever backed up to the user's own private profile (RLS:
 * own-row only). It is never shown in Circles, to friends, on public
 * profiles, in social features, or sent to analytics (see `privacy.ts`).
 */
export type FaithPreference = 'islam' | 'christianity' | 'buddhism' | 'hinduism' | 'non_religious' | 'prefer_not_to_say';

export const FAITH_PREFERENCES: readonly FaithPreference[] = [
  'islam',
  'christianity',
  'buddhism',
  'hinduism',
  'non_religious',
  'prefer_not_to_say',
];

export const FAITH_PREFERENCE_LABEL: Record<FaithPreference, string> = {
  islam: 'Islam',
  christianity: 'Christianity',
  buddhism: 'Buddhism',
  hinduism: 'Hinduism',
  non_religious: 'Non-religious / Guided Reflection',
  prefer_not_to_say: 'Prefer not to say',
};

/** Traditions with a Daily Recitation. */
export type FaithTradition = 'islam' | 'christianity' | 'buddhism' | 'hinduism';

export const FAITH_TRADITIONS: readonly FaithTradition[] = ['islam', 'christianity', 'buddhism', 'hinduism'];

export const TRADITION_LABEL: Record<FaithTradition, string> = {
  islam: 'Islam',
  christianity: 'Christianity',
  buddhism: 'Buddhism',
  hinduism: 'Hinduism',
};

/** Builds a value for every tradition. */
export function perTradition<T>(make: (tradition: FaithTradition) => T): Record<FaithTradition, T> {
  return { islam: make('islam'), christianity: make('christianity'), buddhism: make('buddhism'), hinduism: make('hinduism') };
}

export function isTradition(value: unknown): value is FaithTradition {
  return FAITH_TRADITIONS.includes(value as FaithTradition);
}

export function isFaithPreference(value: unknown): value is FaithPreference {
  return FAITH_PREFERENCES.includes(value as FaithPreference);
}

/** How a Recitation is shown. The translation always stays one tap away. */
export type RecitationDisplay = {
  showTransliteration: boolean;
  showTranslation: boolean;
};

export type FaithSettings = {
  /** Primary Faith preference; null until the user chooses (treated like "Prefer not to say"). */
  primary: FaithPreference | null;
  /**
   * Browse Recitations from other traditions. Separate from `primary`:
   * viewing another tradition never changes the primary preference.
   */
  exploreOtherTraditions: boolean;
  display: RecitationDisplay;
};

export const DEFAULT_FAITH_SETTINGS: FaithSettings = {
  primary: null,
  exploreOtherTraditions: false,
  display: { showTransliteration: true, showTranslation: true },
};
