import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { shouldPresent } from './alarm-handoff';
import { handOff } from './alarms';

const RECHECK_AFTER_MS = 1200;

/** When each occurrence was last shown this session, so closing the alarm screen doesn't reopen it straight away. */
const presentedAt = new Map<string, number>();

export function markAlarmPresented(occurrenceId: string, at = Date.now()) {
  presentedAt.set(occurrenceId, at);
}

/**
 * When Terbit MY opens or returns to the foreground, records genuine native
 * alarms that went off and opens the alarm screen for a morning that still
 * needs its mission. The phone's own alarm controls are never blocked; this
 * only routes the user toward the mission afterwards.
 */
export function useAlarmHandOff() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!navigationReady) return;
    let active = true;

    async function check() {
      const occurrence = await handOff.sync().catch(() => null);
      if (!active || !occurrence) return;
      // Already on an alarm screen (including the Android "Start mission" link).
      if (pathnameRef.current.startsWith('/alarm')) return;
      const now = Date.now();
      if (!shouldPresent(occurrence, now, presentedAt.get(occurrence.id))) return;
      markAlarmPresented(occurrence.id, now);
      router.push({ pathname: '/alarm/[occurrenceId]', params: { occurrenceId: occurrence.id } });
    }

    check();
    let retry: ReturnType<typeof setTimeout> | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      check();
      // iOS may bring the app forward before the alarm button's App Intent has
      // finished recording the tap, so look again shortly after.
      if (retry) clearTimeout(retry);
      retry = setTimeout(check, RECHECK_AFTER_MS);
    });
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      subscription.remove();
    };
  }, [navigationReady]);
}
