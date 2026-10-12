import { useEffect, useState } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';

/**
 * The iPhone's Reduce Motion setting (Settings → Accessibility → Motion).
 * Read only: it's a system preference, not a permission, and Terbit MY
 * follows it automatically. Null until the system has answered (or if it
 * can't), so nothing ever shows a guessed value.
 */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => current && setReduce(value))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      current = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** The iPhone's text size (Dynamic Type) as a scale: 1 is the default size. Updates live. */
export function useTextScale(): number {
  return useWindowDimensions().fontScale;
}

/** Screen transitions: a simple cross-fade instead of sliding when Reduce Motion is on. Unknown → the normal transition. */
export function screenAnimation(reduceMotion: boolean | null): 'fade' | 'default' {
  return reduceMotion === true ? 'fade' : 'default';
}
