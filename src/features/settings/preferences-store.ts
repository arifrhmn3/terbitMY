import type { SettingsStore } from '@/services/storage/settings';

import {
  ACCESSIBILITY_SETTINGS_KEY,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  normaliseAccessibilitySettings,
} from '../accessibility/accessibility-settings';
import { createPreferenceStore } from './preference-store';

/**
 * The app's own preferences (Faith has its own store). Each group is saved
 * under its own key; optional notifications join here when they're built.
 */
export function createAppPreferences(store: SettingsStore) {
  return {
    accessibility: createPreferenceStore({
      store,
      key: ACCESSIBILITY_SETTINGS_KEY,
      defaults: DEFAULT_ACCESSIBILITY_SETTINGS,
      normalise: normaliseAccessibilitySettings,
    }),
  };
}

export type AppPreferences = ReturnType<typeof createAppPreferences>;
