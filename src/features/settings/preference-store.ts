import type { SettingsStore } from '@/services/storage/settings';

/**
 * One group of user preferences saved on the phone under one key (works for
 * guests; no account needed). Anything stored is read through `normalise`,
 * so older or damaged values always come back valid. `current()` gives
 * screens a synchronous value; it is the defaults until `get()` has loaded.
 */
export function createPreferenceStore<T extends object>(options: {
  store: SettingsStore;
  key: string;
  defaults: T;
  normalise: (value: unknown) => T;
}) {
  const { store, key, defaults, normalise } = options;
  let cached: T | null = null;
  let loading: Promise<T> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function get(): Promise<T> {
    if (cached) return cached;
    loading ??= store
      .get(key)
      .then((value) => {
        cached ??= normalise(value);
        notify();
        return cached;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  return {
    key,
    get,
    /** Whether the saved value has been read (screens that act on a preference wait for this). */
    loaded(): boolean {
      return cached !== null;
    },
    current(): T {
      return cached ?? defaults;
    },
    async update(change: Partial<T>): Promise<T> {
      const next = normalise({ ...(await get()), ...change });
      await store.set(key, next);
      cached = next;
      notify();
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

export type PreferenceStore<T extends object> = ReturnType<typeof createPreferenceStore<T>>;

/** A value from a fixed list, or the fallback. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
