import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { progress } from './progress';
import type { ProgressSummary } from './progression';

/** The progress summary, refreshed whenever the screen is focused or new XP is awarded. */
export function useProgressSummary() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSummary(await progress.summary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => progress.subscribe(() => refresh()), [refresh]);

  return { summary, error, refresh };
}
