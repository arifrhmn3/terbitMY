import { useEffect, useSyncExternalStore } from 'react';

import type { AccessibilitySettings } from '../accessibility/accessibility-settings';
import type { PreferenceStore } from './preference-store';
import { preferences } from './preferences';

function usePreference<T extends object>(store: PreferenceStore<T>): { value: T; loaded: boolean } {
  useEffect(() => {
    store.get().catch(() => {});
  }, [store]);
  const value = useSyncExternalStore(store.subscribe, store.current, store.current);
  const loaded = useSyncExternalStore(store.subscribe, store.loaded, store.loaded);
  return { value, loaded };
}

/** Accessibility preferences (Mobility Profile, pacing). `loaded` is false until the saved value has been read. */
export function useAccessibilitySettings() {
  return usePreference<AccessibilitySettings>(preferences.accessibility);
}
