import type { SettingsStore } from '@/services/storage/settings';

import {
  DEFAULT_FAITH_SETTINGS,
  FAITH_TRADITIONS,
  isFaithPreference,
  isTradition,
  type FaithSettings,
  type FaithTradition,
} from './types';

export const FAITH_SETTINGS_KEY = 'faith.settings';

/** The user's own tradition, or null for Non-religious / Prefer not to say / not chosen. */
export function primaryTradition(settings: FaithSettings): FaithTradition | null {
  return isTradition(settings.primary) ? settings.primary : null;
}

/**
 * Recitation traditions the interface shows. Only the user's own tradition,
 * unless "Explore other faith traditions" is on (then all, own first).
 */
export function visibleTraditions(settings: FaithSettings): FaithTradition[] {
  const own = primaryTradition(settings);
  if (!settings.exploreOtherTraditions) return own ? [own] : [];
  return own ? [own, ...FAITH_TRADITIONS.filter((t) => t !== own)] : [...FAITH_TRADITIONS];
}

export type FaithMissionKind = 'recitation' | 'reflection' | 'recitation_reflection';

/**
 * The Faith missions offered, default first. Reflection / Meditation is for
 * everyone; Recitation, and Recitation + Reflection, appear when a tradition
 * is visible.
 */
export function faithMissionKinds(settings: FaithSettings): FaithMissionKind[] {
  const recitation = visibleTraditions(settings).length > 0;
  if (!recitation) return ['reflection'];
  return primaryTradition(settings)
    ? ['recitation', 'reflection', 'recitation_reflection']
    : ['reflection', 'recitation', 'recitation_reflection'];
}

/** Reads anything stored (older or damaged values) into valid settings. */
export function normaliseFaithSettings(value: unknown): FaithSettings {
  const v = (value ?? {}) as Partial<Record<keyof FaithSettings, unknown>>;
  const display = (v.display ?? {}) as Partial<Record<string, unknown>>;
  return {
    primary: isFaithPreference(v.primary) ? v.primary : null,
    exploreOtherTraditions: v.exploreOtherTraditions === true,
    display: {
      showTransliteration:
        typeof display.showTransliteration === 'boolean'
          ? display.showTransliteration
          : DEFAULT_FAITH_SETTINGS.display.showTransliteration,
      showTranslation:
        typeof display.showTranslation === 'boolean' ? display.showTranslation : DEFAULT_FAITH_SETTINGS.display.showTranslation,
    },
  };
}

/**
 * The Faith settings, saved on the phone. Works for guests: no account is
 * ever needed. `onChange` lets the app back the preference up to the
 * user's private profile when signed in.
 */
export function createFaithSettingsStore(store: SettingsStore) {
  let cached: FaithSettings | null = null;
  const listeners = new Set<() => void>();

  return {
    async get(): Promise<FaithSettings> {
      if (cached) return cached;
      cached = normaliseFaithSettings(await store.get(FAITH_SETTINGS_KEY));
      listeners.forEach((l) => l());
      return cached;
    },
    /** The last loaded value (for synchronous UI reads); defaults until `get` has run. */
    current(): FaithSettings {
      return cached ?? DEFAULT_FAITH_SETTINGS;
    },
    async update(change: Partial<FaithSettings>): Promise<FaithSettings> {
      const next = normaliseFaithSettings({ ...(await this.get()), ...change });
      await store.set(FAITH_SETTINGS_KEY, next);
      cached = next;
      listeners.forEach((l) => l());
      return next;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type FaithSettingsStore = ReturnType<typeof createFaithSettingsStore>;
